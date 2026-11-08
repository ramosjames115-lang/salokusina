import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonButton, ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline, bookmark, bookmarkOutline, shareSocialOutline, copyOutline, closeOutline, lockClosedOutline, createOutline } from 'ionicons/icons';
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import * as QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { sanitizeRecipeHtml } from '../shared/sanitize-recipe-html';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-recipe-detail',
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <!-- A guest has no feed to go back to, send them to the welcome page -->
          <ion-back-button [defaultHref]="isGuest ? '/home' : '/menu'" color="dark"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ recipe ? recipe.title : 'Recipe' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      @if (isLoading) {
        <div class="detail-page">
          <div class="skeleton-cover"></div>
          <div class="skeleton-line" style="width: 60%; height: 22px;"></div>
          <div class="skeleton-line" style="width: 30%;"></div>
          <div class="skeleton-line" style="width: 100%;"></div>
          <div class="skeleton-line" style="width: 90%;"></div>
        </div>
      } @else if (!recipe) {
        <div class="empty-state">
          <ion-icon name="heart-outline" aria-hidden="true"></ion-icon>
          <h3>Recipe not found</h3>
          <p>This dish may have been removed or is no longer available.</p>
        </div>
      } @else {
        <div class="detail-page">
          <img *ngIf="recipe.coverPhoto" [src]="recipe.coverPhoto" alt="{{ recipe.title }}" class="cover-photo" />

          <span class="category-badge">{{ recipe.category }}</span>
          @if (recipe.status === 'Draft') {
            <span class="draft-badge">DRAFT &middot; only you can see this</span>
          }
          <h1 class="recipe-title">{{ recipe.title }}</h1>

          <div class="author-row">
            <img [src]="recipe.authorAvatarUrl || 'https://ionicframework.com/docs/img/demos/avatar.svg'" alt="Author" class="author-avatar" />
            <span class="author-name">by {{ recipe.authorUsername || recipe.authorEmail }}</span>
          </div>

          <p class="recipe-description">{{ recipe.description }}</p>

          @if (isGuest) {
            <!-- Somebody opened this from a shared link or a scanned QR code
                 without an account: show the teaser above, then ask them to
                 join before the ingredients and the steps -->
            <div class="guest-gate">
              <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
              <h3>To view this recipe, create an account</h3>
              <p>Join Salo Kusina to read the full ingredients and cooking steps, and to save the dishes you love.</p>
              <ion-button expand="block" class="gate-primary" (click)="goCreateAccount()">
                CREATE AN ACCOUNT
              </ion-button>
              <button type="button" class="gate-secondary" (click)="goLogin()">
                I already have an account
              </button>
            </div>
          } @else {

          <!-- Your own dish: pick up where you left off, Wattpad-style -->
          @if (isMyRecipe) {
            <ion-button expand="block" fill="outline" class="edit-btn" (click)="goEdit()">
              <ion-icon name="create-outline" slot="start" aria-hidden="true"></ion-icon>
              {{ recipe.status === 'Draft' ? 'CONTINUE WRITING' : 'START EDITING' }}
            </ion-button>
          }

          <div class="action-row">
            <button type="button" class="icon-action-btn like-btn" [class.active]="isLiked()" (click)="toggleLike()" [attr.aria-label]="isLiked() ? 'Remove like' : 'Like this recipe'">
              <ion-icon [name]="isLiked() ? 'heart' : 'heart-outline'" aria-hidden="true"></ion-icon>
              <span>{{ likeCount() }}</span>
            </button>
            <button type="button" class="icon-action-btn bookmark-btn" [class.active]="isBookmarked()" (click)="toggleBookmark()" [attr.aria-label]="isBookmarked() ? 'Remove from Library' : 'Bookmark this recipe'">
              <ion-icon [name]="isBookmarked() ? 'bookmark' : 'bookmark-outline'" aria-hidden="true"></ion-icon>
              <span>{{ saveCount() }}</span>
            </button>
            <button type="button" class="icon-action-btn share-btn" (click)="openShare()" aria-label="Share this recipe">
              <ion-icon name="share-social-outline" aria-hidden="true"></ion-icon>
              <span>Share</span>
            </button>
          </div>

          @if (showShareSheet) {
            <div class="share-sheet" (click)="closeShare()">
              <div class="share-sheet-card" (click)="$event.stopPropagation()">
                <div class="share-sheet-header">
                  <h3>Share this Dish</h3>
                  <button type="button" class="close-btn" (click)="closeShare()" aria-label="Close">
                    <ion-icon name="close-outline"></ion-icon>
                  </button>
                </div>

                <img [src]="qrDataUrl" alt="QR code for this recipe" class="qr-image" />
                <p class="qr-hint">Scan this with a phone camera to open this dish.</p>

                <div class="share-link-row">
                  <input type="text" readonly [value]="shareUrl" (click)="$any($event.target).select()" />
                  <button type="button" (click)="copyLink()" aria-label="Copy link">
                    <ion-icon name="copy-outline"></ion-icon>
                  </button>
                </div>

                @if (canUseNativeShare) {
                  <ion-button expand="block" (click)="nativeShare()">Share via...</ion-button>
                }
              </div>
            </div>
          }

          <div class="section">
            <h2 class="section-label">Ingredients</h2>
            <p class="ingredients-text">{{ recipe.ingredients }}</p>
          </div>

          <div class="section">
            <h2 class="section-label">Steps / Story</h2>
            <div class="story-content" [innerHTML]="safeContent"></div>
          </div>

          }
        </div>
      }
    </ion-content>
  `,
  styles: [`
    .detail-page {
      max-width: 700px;
      margin: 0 auto;
      padding: 16px 20px 48px;
    }
    .cover-photo {
      width: 100%;
      max-height: 280px;
      object-fit: cover;
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .category-badge {
      font-size: 12px;
      font-weight: 600;
      color: #f48240;
      background: #fff3e8;
      padding: 3px 10px;
      border-radius: 6px;
      display: inline-block;
      margin-bottom: 8px;
    }
    .recipe-title {
      font-size: 26px;
      font-weight: 800;
      margin: 0 0 10px;
      color: #1a0e05;
    }
    .author-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .author-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
    }
    .author-name {
      font-size: 13px;
      color: #665c54;
      font-weight: 600;
    }
    .recipe-description {
      font-size: 15px;
      color: #4a4036;
      line-height: 1.5;
      margin: 0 0 16px;
    }
    .draft-badge {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.3px;
      color: #8a6d3b;
      background: #fcf0d4;
      padding: 3px 10px;
      border-radius: 6px;
      display: inline-block;
      margin: 0 0 8px 8px;
    }
    .edit-btn {
      --border-color: #f48240;
      --color: #f48240;
      --border-radius: 12px;
      font-weight: 800;
      height: 48px;
      margin: 4px 0 8px;
    }
    .guest-gate {
      border: 1px solid #f4b183;
      background: #fff3e8;
      border-radius: 16px;
      padding: 24px 20px;
      text-align: center;
      margin-top: 8px;
    }
    .guest-gate ion-icon {
      font-size: 34px;
      color: #f48240;
    }
    .guest-gate h3 {
      font-size: 18px;
      font-weight: 800;
      color: #1a0e05;
      margin: 10px 0 6px;
    }
    .guest-gate p {
      font-size: 13px;
      color: #665c54;
      line-height: 1.5;
      margin: 0 0 18px;
    }
    .guest-gate .gate-primary {
      --background: #f48240;
      --color: #ffffff;
      --border-radius: 12px;
      font-weight: 800;
      height: 50px;
    }
    .guest-gate .gate-secondary {
      background: none;
      border: none;
      margin-top: 12px;
      color: #f48240;
      font-size: 13px;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }
    .action-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 12px 0;
      border-top: 1px solid #f0f0f0;
      border-bottom: 1px solid #f0f0f0;
      margin-bottom: 20px;
    }
    .icon-action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      padding: 4px;
      font-size: 15px;
      font-weight: 600;
      color: #8a8a8a;
      cursor: pointer;

      ion-icon { font-size: 24px; }
      &.like-btn.active { color: #e0245e; }
      &.bookmark-btn.active { color: #f48240; }
      &.share-btn { margin-left: auto; }
    }
    .share-sheet {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
    }
    .share-sheet-card {
      background: #ffffff;
      width: 100%;
      max-width: 420px;
      border-radius: 20px 20px 0 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .share-sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-bottom: 12px;

      h3 { font-size: 16px; font-weight: 800; margin: 0; color: #1a0e05; }
      .close-btn {
        background: none;
        border: none;
        font-size: 22px;
        color: #8a8a8a;
        cursor: pointer;
        line-height: 1;
      }
    }
    .qr-image {
      width: 180px;
      height: 180px;
      margin-bottom: 8px;
    }
    .qr-hint {
      font-size: 12px;
      color: #8a8a8a;
      margin: 0 0 16px;
    }
    .share-link-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      margin-bottom: 12px;

      input {
        flex: 1;
        min-width: 0;
        background: #f7f3ef;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 13px;
        color: #333;
      }

      button {
        background: #f48240;
        border: none;
        border-radius: 8px;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        cursor: pointer;
        flex-shrink: 0;

        ion-icon { font-size: 18px; }
      }
    }
    .section {
      margin-bottom: 24px;
    }
    .section-label {
      font-size: 16px;
      font-weight: 700;
      color: #1a0e05;
      margin: 0 0 10px;
    }
    .ingredients-text {
      white-space: pre-wrap;
      font-size: 15px;
      color: #333;
      line-height: 1.6;
      margin: 0;
    }
    .story-content {
      font-size: 15px;
      color: #222;
      line-height: 1.7;
    }
    .story-content :global(img), .story-content ::ng-deep img,
    .story-content ::ng-deep video {
      max-width: 100%;
      border-radius: 6px;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 32px;
      color: #665c54;

      ion-icon { font-size: 48px; color: #f48240; margin-bottom: 12px; }
      h3 { margin: 0 0 8px; color: #1a0e05; }
    }
    .skeleton-cover {
      width: 100%;
      height: 220px;
      border-radius: 12px;
      margin-bottom: 16px;
      background: linear-gradient(90deg, #f0f0f0 25%, #f7f7f7 37%, #f0f0f0 63%);
      background-size: 400% 100%;
      animation: shimmer 1.4s ease infinite;
    }
    .skeleton-line {
      height: 14px;
      border-radius: 6px;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #f0f0f0 25%, #f7f7f7 37%, #f0f0f0 63%);
      background-size: 400% 100%;
      animation: shimmer 1.4s ease infinite;
    }
    @keyframes shimmer {
      0% { background-position: 100% 50%; }
      100% { background-position: 0 50%; }
    }
  `],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonIcon, IonButton
  ]
})
export class RecipeDetailPage implements OnInit {
  recipe: any = null;
  isLoading: boolean = true;
  safeContent: SafeHtml = '';

  showShareSheet: boolean = false;
  shareUrl: string = '';
  qrDataUrl: string | null = null;
  readonly canUseNativeShare: boolean = typeof navigator !== 'undefined' && !!(navigator as any).share;

  private currentUserId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({ heart, heartOutline, bookmark, bookmarkOutline, shareSocialOutline, copyOutline, closeOutline, lockClosedOutline, createOutline });
  }

  async ngOnInit() {
    const auth = getAuth();
    await auth.authStateReady();
    this.currentUserId = auth.currentUser?.uid ?? null;

    const recipeId = this.route.snapshot.paramMap.get('id');
    if (!recipeId) {
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      const db = getFirestore();
      const snap = await getDoc(doc(db, 'recipes', recipeId));
      if (snap.exists()) {
        this.recipe = { id: snap.id, ...snap.data() };
        // Recipe content is other users' contenteditable input - it's also
        // sanitized before being saved (recipe-editor.page.ts), but we
        // sanitize again here in case any unsanitized content was already
        // stored before that fix, or written directly outside the editor
        this.safeContent = this.sanitizer.bypassSecurityTrustHtml(sanitizeRecipeHtml(this.recipe.content || ''));
      }
    } catch (error) {
      console.error('Error loading the recipe:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }

  // ----- Your own dish -----

  get isMyRecipe(): boolean {
    return !!this.currentUserId && this.recipe?.authorId === this.currentUserId;
  }

  goEdit() {
    if (this.recipe) this.router.navigate(['/recipe-editor', this.recipe.id]);
  }

  // ----- Guests (opened from a shared link or a scanned QR code) -----

  get isGuest(): boolean {
    return !this.currentUserId;
  }

  // Where to send them back to once they've signed up or logged in
  private get returnUrl(): string {
    return this.recipe ? `/recipe/${this.recipe.id}` : '/menu';
  }

  goCreateAccount() {
    this.router.navigate(['/register'], { queryParams: { returnUrl: this.returnUrl } });
  }

  goLogin() {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
  }

  isLiked(): boolean {
    return !!this.currentUserId && (this.recipe?.likedBy || []).includes(this.currentUserId);
  }

  likeCount(): number {
    return (this.recipe?.likedBy || []).length;
  }

  isBookmarked(): boolean {
    return !!this.currentUserId && (this.recipe?.savedBy || []).includes(this.currentUserId);
  }

  saveCount(): number {
    return (this.recipe?.savedBy || []).length;
  }

  async toggleLike() {
    if (!this.currentUserId || !this.recipe) {
      this.showToast('Please sign in to like a dish.', 'danger');
      return;
    }

    const alreadyLiked = this.isLiked();
    this.recipe.likedBy = alreadyLiked
      ? (this.recipe.likedBy || []).filter((uid: string) => uid !== this.currentUserId)
      : [...(this.recipe.likedBy || []), this.currentUserId];

    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'recipes', this.recipe.id), {
        likedBy: alreadyLiked ? arrayRemove(this.currentUserId) : arrayUnion(this.currentUserId)
      });
    } catch (error) {
      console.error('Error liking the recipe:', error);
      this.recipe.likedBy = alreadyLiked
        ? [...(this.recipe.likedBy || []), this.currentUserId]
        : (this.recipe.likedBy || []).filter((uid: string) => uid !== this.currentUserId);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  async toggleBookmark() {
    if (!this.currentUserId || !this.recipe) {
      this.showToast('Please sign in to bookmark a dish.', 'danger');
      return;
    }

    const alreadyBookmarked = this.isBookmarked();
    this.recipe.savedBy = alreadyBookmarked
      ? (this.recipe.savedBy || []).filter((uid: string) => uid !== this.currentUserId)
      : [...(this.recipe.savedBy || []), this.currentUserId];

    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'recipes', this.recipe.id), {
        savedBy: alreadyBookmarked ? arrayRemove(this.currentUserId) : arrayUnion(this.currentUserId)
      });

      await updateDoc(doc(db, 'users', this.currentUserId), {
        bookmarks: alreadyBookmarked ? arrayRemove(this.recipe.id) : arrayUnion(this.recipe.id)
      }).catch(async () => {
        // users/{uid} may not have been created with setDoc merge yet in rare cases
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'users', this.currentUserId!), {
          bookmarks: alreadyBookmarked ? arrayRemove(this.recipe.id) : arrayUnion(this.recipe.id)
        }, { merge: true });
      });
    } catch (error) {
      console.error('Error bookmarking the recipe:', error);
      this.recipe.savedBy = alreadyBookmarked
        ? [...(this.recipe.savedBy || []), this.currentUserId]
        : (this.recipe.savedBy || []).filter((uid: string) => uid !== this.currentUserId);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  // ----- Share / QR code -----

  // The address a scanned QR code (or a pasted link) has to resolve to from
  // somebody else's phone:
  //   - native app: its webview origin is just "https://localhost", useless
  //     off-device, so use the hosted domain
  //   - "ng serve" on this machine: "localhost" means the SCANNING phone
  //     itself, so again use the hosted domain
  //   - served over a LAN address, or the live site: that origin is already
  //     reachable from another device, keep it
  private publicBaseUrl(): string {
    if (Capacitor.isNativePlatform()) return environment.appUrl;
    const host = window.location.hostname;
    const isLocalOnly = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    return isLocalOnly ? environment.appUrl : window.location.origin;
  }

  async openShare() {
    if (!this.recipe) return;

    this.shareUrl = `${this.publicBaseUrl()}/recipe/${this.recipe.id}`;
    this.showShareSheet = true;

    try {
      this.qrDataUrl = await QRCode.toDataURL(this.shareUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#1a0e05', light: '#ffffff' }
      });
    } catch (error) {
      console.error('Error generating the QR code:', error);
    } finally {
      this.cdr.detectChanges(); // QRCode's promise resolves outside Angular's change detection
    }
  }

  closeShare() {
    this.showShareSheet = false;
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.shareUrl);
      this.showToast('Link copied to clipboard!');
    } catch (error) {
      console.error('Error copying the link:', error);
      this.showToast('Could not copy the link.', 'danger');
    }
  }

  async nativeShare() {
    try {
      await (navigator as any).share({
        title: this.recipe?.title,
        text: `Check out this recipe on Salo Kusina: ${this.recipe?.title}`,
        url: this.shareUrl
      });
    } catch (error) {
      // The user cancelling the native share sheet also lands here - not a real error
      console.error('Error sharing:', error);
    }
  }
}
