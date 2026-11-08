import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonAvatar, IonPopover, IonList,
  IonItem, IonIcon, IonLabel, IonFooter, IonTabBar,
  IonTabButton, IonBadge, IonSearchbar, IonSegment, IonSegmentButton,
  IonButton, AlertController, ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  logOutOutline, restaurantOutline, home,
  searchOutline, bookOutline, pencilOutline,
  notificationsOutline, heart, heartOutline,
  bookmark, bookmarkOutline, fastFoodOutline,
  iceCreamOutline, leafOutline, ribbonOutline,
  appsOutline, closeCircle, pricetagOutline,
  sparklesOutline, megaphoneOutline
} from 'ionicons/icons';

// Firebase imports
import {
  getFirestore, collection, query, where, getDocs, addDoc,
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp
} from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { AVATAR_STORAGE_PREFIX } from '../account-setup/account-setup.page';
import { CategoryOption, DEFAULT_CATEGORIES, loadCategoryCatalog } from '../shared/category-catalog';
import {
  AdminFeaturedPick, FEATURED_SETTINGS_COLLECTION, FEATURED_SETTINGS_DOC_ID,
  FeaturedPick, pickFeaturedDish
} from '../shared/featured-dish';
import { buildInterestProfile, rankForYou } from '../shared/recommendations';
import {
  buildInterestGroups, flattenInterests, INTEREST_GROUPS, InterestGroup
} from '../shared/interest-catalog';

type MenuView = 'feed' | 'library' | 'categories';
type LibraryTab = 'saved' | 'liked' | 'mydishes';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonAvatar, IonPopover, IonList,
    IonItem, IonIcon, IonLabel, IonFooter, IonTabBar,
    IonTabButton, IonBadge, IonSearchbar, IonSegment, IonSegmentButton,
    IonButton
  ]
})
export class MenuPage implements OnInit {
  @ViewChild(IonContent) ionContent!: IonContent;
  @ViewChild(IonSearchbar) searchbar!: IonSearchbar;

  allRecipes: any[] = [];         // Everything loaded from Firestore
  publishedRecipes: any[] = [];   // The (filtered) list that actually gets shown
  myRecipes: any[] = [];          // Dishes authored by the current user (drafts + published)
  isLoading: boolean = true;
  avatarUrl: string | null = null;
  skeletonPlaceholders = [1, 2, 3];

  currentUserId: string | null = null;
  bookmarkedIds = new Set<string>();

  // 'feed' = all published dishes, 'library' = the user's personal collection,
  // 'categories' = the full-screen "Browse Categories" picker
  activeView: MenuView = 'feed';
  // Which section of the Library is showing: bookmarked, liked, or authored by me
  libraryTab: LibraryTab = 'saved';
  // When set, the Home feed only shows dishes in this category
  selectedCategory: string | null = null;

  // Built from the categories actually used in the database, so a category a
  // user typed in themselves shows up here too (see category-catalog.ts)
  categories: CategoryOption[] = DEFAULT_CATEGORIES;

  // The food the user says they're into, chosen during Account Setup - drives
  // the ordering of "Top Dishes For You"
  chosenInterests: string[] = [];

  // The grouped list of interests they can pick from (see interest-catalog.ts)
  interestGroups: InterestGroup[] = INTEREST_GROUPS;

  // A dish an admin pinned as the Featured Dish, if there is one
  adminFeaturedPick: AdminFeaturedPick | null = null;

  // Worked out by refreshFeed(): the Featured Dish (plus the reason it won),
  // the Home feed in "for you" order, and whether we know enough about this
  // user's taste to call the section "For You" at all
  featuredPick: FeaturedPick | null = null;
  rankedFeed: any[] = [];
  isPersonalized: boolean = false;

  hasUnreadNotifications: boolean = true;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    addIcons({
      logOutOutline, restaurantOutline, home,
      searchOutline, bookOutline, pencilOutline,
      notificationsOutline, heart, heartOutline,
      bookmark, bookmarkOutline, fastFoodOutline,
      iceCreamOutline, leafOutline, ribbonOutline,
      appsOutline, closeCircle, pricetagOutline,
      sparklesOutline, megaphoneOutline
    });
  }

  async ngOnInit() {
    // Coming back here right after saving a draft should land straight on
    // the "My Dishes" tab of the Library instead of the home feed
    const navigation = this.router.getCurrentNavigation();
    const navState = navigation?.extras.state as any;
    if (navState?.openLibraryTab) {
      this.activeView = 'library';
      this.libraryTab = navState.openLibraryTab;
    }

    this.loadAvatar();
    // loadPublishedRecipes doesn't need the current user at all, and
    // loadMyRecipes only needs the id loadCurrentUser resolves - so only that
    // one has to wait, instead of blocking everything behind it first
    await Promise.all([
      this.loadCurrentUser(),
      this.loadPublishedRecipes(),
      this.loadAdminFeaturedPick()
    ]);
    // Everything the Featured Dish and the "for you" ordering need is in now
    this.refreshFeed();
    // Both of these need something the calls above resolved: the user's id, and
    // the categories of the dishes that just loaded
    await Promise.all([this.loadMyRecipes(), this.loadCategories()]);
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }

  // A non-blocking confirm dialog - unlike window.confirm(), it doesn't freeze
  // the rest of the page while waiting for an answer
  private async confirmAction(message: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Please confirm',
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Yes', role: 'confirm' }
      ]
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  // Loads the profile picture saved in the browser's localStorage while
  // Firebase Storage isn't enabled for this project yet
  private async loadAvatar() {
    const auth = getAuth();
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const savedAvatar = localStorage.getItem(AVATAR_STORAGE_PREFIX + currentUser.uid);

    // auth.authStateReady() relies on IndexedDB, which Angular's zone doesn't
    // actually track — so we need to force a re-render here.
    this.avatarUrl = savedAvatar;
    this.cdr.detectChanges();
  }

  // Loads the current user's bookmarks and their chosen food interests
  private async loadCurrentUser() {
    const auth = getAuth();
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    this.currentUserId = currentUser?.uid ?? null;
    if (!this.currentUserId) return;

    try {
      const db = getFirestore();
      const userSnap = await getDoc(doc(db, 'users', this.currentUserId));
      const bookmarks = (userSnap.data()?.['bookmarks'] as string[]) || [];
      this.bookmarkedIds = new Set(bookmarks);
      this.chosenInterests = (userSnap.data()?.['interests'] as string[]) || [];
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  }

  // The Featured Dish an admin pinned, if any. A missing document just means
  // "no pick yet" - the algorithm in featured-dish.ts takes over from there.
  private async loadAdminFeaturedPick() {
    try {
      const db = getFirestore();
      const snap = await getDoc(doc(db, FEATURED_SETTINGS_COLLECTION, FEATURED_SETTINGS_DOC_ID));
      this.adminFeaturedPick = snap.exists() ? (snap.data() as AdminFeaturedPick) : null;
    } catch (error) {
      console.error('Could not load the admin Featured Dish pick:', error);
      this.adminFeaturedPick = null;
    }
  }

  // Categories come from the database, not a hardcoded list: the shared
  // /categories collection plus whatever the loaded dishes are tagged with
  private async loadCategories() {
    const usedByLoadedDishes = this.allRecipes.map((recipe) => recipe.category || '');
    try {
      this.categories = await loadCategoryCatalog(getFirestore(), usedByLoadedDishes);
      // Anything the fixed interest groups don't already cover gets offered as
      // an interest too, including an interest this user saved earlier
      this.interestGroups = buildInterestGroups(this.categories, this.chosenInterests);
    } catch (error) {
      console.error('Could not build the category list:', error);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  async loadPublishedRecipes() {
    const db = getFirestore();
    this.isLoading = true;
    try {
      const q = query(
        collection(db, 'recipes'),
        where('status', '==', 'Published')
      );

      const querySnapshot = await getDocs(q);
      this.allRecipes = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        this.allRecipes.push({
          id: docSnap.id,
          ...data,
          likedBy: data['likedBy'] || [],
          savedBy: data['savedBy'] || []
        });
      });

      // Start publishedRecipes off as a copy of every dish
      this.publishedRecipes = [...this.allRecipes];
    } catch (error) {
      console.error('Error loading published recipes:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  // Loads every dish (draft or published) this user has authored, for the
  // "My Dishes" tab of the Library
  async loadMyRecipes() {
    if (!this.currentUserId) return;
    try {
      const db = getFirestore();
      const q = query(collection(db, 'recipes'), where('authorId', '==', this.currentUserId));
      const querySnapshot = await getDocs(q);
      this.myRecipes = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        this.myRecipes.push({
          id: docSnap.id,
          ...data,
          likedBy: data['likedBy'] || [],
          savedBy: data['savedBy'] || []
        });
      });
    } catch (error) {
      console.error('Error loading your dishes:', error);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  // Published dishes the current user has liked
  get likedRecipes(): any[] {
    if (!this.currentUserId) return [];
    return this.allRecipes.filter(recipe => (recipe.likedBy || []).includes(this.currentUserId));
  }

  // Recomputed whenever the dishes, the user's interests, or the admin's pick
  // change - deliberately NOT on every render, so the feed doesn't re-shuffle
  // under the user's finger the moment they tap a like
  private refreshFeed() {
    const nowMs = Date.now();
    const profile = buildInterestProfile(this.chosenInterests, this.allRecipes, this.currentUserId);
    this.isPersonalized = !profile.isEmpty;
    this.featuredPick = pickFeaturedDish(this.allRecipes, this.adminFeaturedPick, nowMs);
    this.rankedFeed = rankForYou(this.allRecipes, profile, nowMs);
    this.cdr.detectChanges(); // we're usually called right after a Firestore load
  }

  // True while the Home feed is showing everything - no search, no category
  // chip. The Featured Dish banner only belongs on an unfiltered feed.
  get isUnfilteredFeed(): boolean {
    return this.activeView === 'feed'
      && !this.selectedCategory
      && this.publishedRecipes.length === this.allRecipes.length;
  }

  // The hero banner at the top of the Home feed - see featured-dish.ts for how
  // the dish is chosen (admin's pick first, then most-liked this week/month)
  get featuredRecipe(): any | null {
    return this.isUnfilteredFeed ? (this.featuredPick?.recipe ?? null) : null;
  }

  // The small line under the FEATURED DISH badge: why this dish is up there
  get featuredReason(): string {
    return this.isUnfilteredFeed ? (this.featuredPick?.reason ?? '') : '';
  }

  // What actually gets shown, depending on the active view/tab
  get visibleRecipes(): any[] {
    if (this.activeView === 'library') {
      if (this.libraryTab === 'liked') return this.likedRecipes;
      if (this.libraryTab === 'mydishes') return this.myRecipes;
      return this.allRecipes.filter(recipe => this.bookmarkedIds.has(recipe.id)); // 'saved'
    }

    // Home feed: start from the personalized order, then narrow it down to
    // whatever the user is filtering by (search box / category chip)
    const matchesFilter = new Set(this.publishedRecipes.map(recipe => recipe.id));
    let feed = this.rankedFeed.filter(recipe => matchesFilter.has(recipe.id));

    if (this.selectedCategory) {
      return feed.filter(recipe => recipe.category === this.selectedCategory);
    }
    // The featured dish already has its own banner above the list - no need to
    // repeat it right underneath (unless it's the only dish there is)
    const featured = this.featuredRecipe;
    if (featured && feed.length > 1) {
      feed = feed.filter(recipe => recipe.id !== featured.id);
    }
    return feed;
  }

  setLibraryTab(tab: LibraryTab) {
    this.libraryTab = tab;
  }

  // Filters the dishes based on what the user types
  handleSearch(event: any) {
    const searchTerm = event.target.value ? event.target.value.toLowerCase().trim() : '';

    if (!searchTerm) {
      // If the searchbar is empty, show everything again
      this.publishedRecipes = [...this.allRecipes];
    } else {
      // Filter by title or description
      this.publishedRecipes = this.allRecipes.filter(recipe =>
        (recipe.title && recipe.title.toLowerCase().includes(searchTerm)) ||
        (recipe.description && recipe.description.toLowerCase().includes(searchTerm))
      );
    }
  }

  // Opens the full Wattpad-style reading view for a dish
  goToRecipe(recipeId: string) {
    this.router.navigate(['/recipe', recipeId]);
  }

  // ----- Bottom tab bar actions -----

  goHome() {
    this.activeView = 'feed';
    this.ionContent?.scrollToTop(300);
  }

  goCategories() {
    this.activeView = 'categories';
    this.ionContent?.scrollToTop(300);
  }

  // Picking a category (or null for "More"/clear) jumps back to the feed,
  // filtered to just that category
  filterByCategory(categoryName: string | null) {
    this.selectedCategory = categoryName;
    this.activeView = 'feed';
    this.ionContent?.scrollToTop(300);
  }

  goLibrary() {
    this.activeView = 'library';
    this.ionContent?.scrollToTop(300);
  }

  goWrite() {
    this.router.navigate(['/recipe-setup']);
  }

  onOpenNotifications() {
    this.hasUnreadNotifications = false;
  }

  // ----- Interests (what "Top Dishes For You" is built from) -----

  // Lets the user re-pick their food interests any time from the profile menu,
  // not just during Account Setup
  async editInterests() {
    if (!this.currentUserId) {
      this.showToast('Please sign in to set your interests.', 'danger');
      return;
    }

    const alreadyChosen = new Set(this.chosenInterests.map((name) => name.toLowerCase()));
    const alert = await this.alertController.create({
      header: 'My Interests',
      subHeader: 'Pick the food you want to see more of.',
      // A checkbox dialog can't show group headings, so each row carries its
      // group as a prefix: "Main ingredient · Manok"
      inputs: flattenInterests(this.interestGroups).map((entry) => ({
        type: 'checkbox' as const,
        label: entry.label,
        value: entry.name,
        checked: alreadyChosen.has(entry.name.toLowerCase())
      })),
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', role: 'confirm' }
      ]
    });
    await alert.present();

    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    await this.saveInterests((data?.values as string[]) || []);
  }

  private async saveInterests(interests: string[]) {
    const previous = this.chosenInterests;
    this.chosenInterests = interests;
    this.refreshFeed(); // re-order the feed right away, before the save lands

    try {
      const db = getFirestore();
      await setDoc(doc(db, 'users', this.currentUserId!), { interests }, { merge: true });
      this.showToast(interests.length ? 'Your interests were saved!' : 'Interests cleared.');
    } catch (error) {
      console.error('Error saving interests:', error);
      this.chosenInterests = previous; // roll back if the save failed
      this.refreshFeed();
      this.showToast('Could not save your interests. Please try again.', 'danger');
    }
  }

  // ----- Asking the admin to feature your dish -----

  // Files the request; an admin reviews it and pins the dish as the Featured
  // Dish from the admin screen
  async requestFeature(recipe: any, event: Event) {
    event.stopPropagation();
    if (!this.currentUserId) {
      this.showToast('Please sign in first.', 'danger');
      return;
    }

    const confirmed = await this.confirmAction(
      `Ask the admin to feature "${recipe.title}" on the Home page?`
    );
    if (!confirmed) return;

    try {
      const db = getFirestore();
      await addDoc(collection(db, 'featureRequests'), {
        recipeId: recipe.id,
        recipeTitle: recipe.title || '',
        requesterId: this.currentUserId,
        status: 'Pending',
        createdAt: serverTimestamp()
      });
      this.showToast('Your request was sent to the admin!');
    } catch (error) {
      console.error('Error sending the feature request:', error);
      this.showToast('Could not send the request. Please try again.', 'danger');
    }
  }

  // ----- Like / Bookmark -----

  isLiked(recipe: any): boolean {
    return !!this.currentUserId && (recipe.likedBy || []).includes(this.currentUserId);
  }

  likeCount(recipe: any): number {
    return (recipe.likedBy || []).length;
  }

  isBookmarked(recipe: any): boolean {
    return this.bookmarkedIds.has(recipe.id);
  }

  saveCount(recipe: any): number {
    return (recipe.savedBy || []).length;
  }

  async toggleLike(recipe: any, event: Event) {
    event.stopPropagation();
    if (!this.currentUserId) {
      this.showToast('Please sign in to like a dish.', 'danger');
      return;
    }

    const alreadyLiked = this.isLiked(recipe);
    // Update the screen right away (optimistic) before the Firestore request finishes
    recipe.likedBy = alreadyLiked
      ? (recipe.likedBy || []).filter((uid: string) => uid !== this.currentUserId)
      : [...(recipe.likedBy || []), this.currentUserId];

    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'recipes', recipe.id), {
        likedBy: alreadyLiked ? arrayRemove(this.currentUserId) : arrayUnion(this.currentUserId)
      });
    } catch (error) {
      console.error('Error liking the recipe:', error);
      // Roll back if the save failed
      recipe.likedBy = alreadyLiked
        ? [...(recipe.likedBy || []), this.currentUserId]
        : (recipe.likedBy || []).filter((uid: string) => uid !== this.currentUserId);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  async toggleBookmark(recipe: any, event: Event) {
    event.stopPropagation();
    if (!this.currentUserId) {
      this.showToast('Please sign in to bookmark a dish.', 'danger');
      return;
    }

    const alreadyBookmarked = this.isBookmarked(recipe);
    // Optimistic update here too
    if (alreadyBookmarked) {
      this.bookmarkedIds.delete(recipe.id);
      recipe.savedBy = (recipe.savedBy || []).filter((uid: string) => uid !== this.currentUserId);
    } else {
      this.bookmarkedIds.add(recipe.id);
      recipe.savedBy = [...(recipe.savedBy || []), this.currentUserId];
    }

    try {
      const db = getFirestore();
      await Promise.all([
        setDoc(doc(db, 'users', this.currentUserId), {
          bookmarks: alreadyBookmarked ? arrayRemove(recipe.id) : arrayUnion(recipe.id)
        }, { merge: true }),
        updateDoc(doc(db, 'recipes', recipe.id), {
          savedBy: alreadyBookmarked ? arrayRemove(this.currentUserId) : arrayUnion(this.currentUserId)
        })
      ]);
    } catch (error) {
      console.error('Error bookmarking the recipe:', error);
      // Roll back if the save failed
      if (alreadyBookmarked) {
        this.bookmarkedIds.add(recipe.id);
        recipe.savedBy = [...(recipe.savedBy || []), this.currentUserId];
      } else {
        this.bookmarkedIds.delete(recipe.id);
        recipe.savedBy = (recipe.savedBy || []).filter((uid: string) => uid !== this.currentUserId);
      }
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  async onLogout() {
    try {
      const auth = getAuth();
      await signOut(auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }
}
