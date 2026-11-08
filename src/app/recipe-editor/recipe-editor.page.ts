import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonFooter,
  AlertController, ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { imageOutline, videocamOutline, logoYoutube, cloudUploadOutline } from 'ionicons/icons';
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { AVATAR_STORAGE_PREFIX } from '../account-setup/account-setup.page';
import { sanitizeRecipeHtml } from '../shared/sanitize-recipe-html';
import { rememberCategory } from '../shared/category-catalog';

// Firestore rejects any document bigger than ~1 MiB. We budget well under that
// for the recipe content (title/ingredients/etc. also share that same document).
const MAX_CONTENT_BYTES = 700_000;
const IMAGE_MAX_DIMENSION = 900;
const IMAGE_JPEG_QUALITY = 0.72;
// Inline base64 video can't realistically fit in a Firestore document at all,
// so we only accept very short/small clips until real video storage exists.
const MAX_VIDEO_FILE_BYTES = 300_000;
// Recognizes youtube.com/watch, youtu.be, /embed/ and /shorts/ links
const YOUTUBE_URL_PATTERN = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
// So an accidental refresh doesn't wipe out whatever the user was writing
const RECIPE_DRAFT_STORAGE_KEY = 'salokusina_recipe_draft';

@Component({
  selector: 'app-recipe-editor',
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="savedRecipeId ? '/menu' : '/recipe-setup'" color="dark"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ isEditingExisting ? 'Edit the Recipe' : 'Write the Recipe' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <div class="editor-page">

        <img *ngIf="coverPhoto" [src]="coverPhoto" alt="Cover photo" class="cover-photo-preview" />
        <h1 class="recipe-title">{{ title }}</h1>
        <p class="recipe-meta">Category: {{ category }}</p>

        <!-- Ingredients: Wattpad-style, no surrounding box, just flows -->
        <div class="section">
          <label class="section-label">Ingredients</label>
          <textarea
            class="flow-field"
            rows="1"
            [(ngModel)]="ingredients"
            placeholder="Enter the ingredients here..."
            (input)="autoGrow($event); scheduleDraftSave()"></textarea>
        </div>

        <!-- THE ACTUAL EDITOR, LIKE A WATTPAD WRITING SCREEN -->
        <div class="section editor-section">
          <label class="section-label">Steps / Story</label>

          <div
            #editorArea
            class="flow-field editable"
            contenteditable="true"
            data-placeholder="Write the cooking steps here..."
            (keyup)="listenCursor()"
            (click)="listenCursor()"
            (focus)="listenCursor()"
            (input)="scheduleDraftSave()"></div>

          <!-- THE FLOATING ICONS (Appear wherever the cursor is) -->
          <div
            *ngIf="showToolbar"
            class="inline-toolbar"
            [ngStyle]="{ 'top.px': toolbarTop, 'left.px': toolbarLeft }">

            <label class="toolbar-btn" aria-label="Add a photo">
              <ion-icon name="image-outline"></ion-icon>
              <input type="file" accept="image/*" (change)="insertMedia($event, 'image')" hidden />
            </label>

            <div class="toolbar-btn video-toggle-wrap" aria-label="Add a video">
              <ion-icon name="videocam-outline" (click)="toggleVideoOptions()"></ion-icon>

              <div *ngIf="showVideoOptions" class="video-options-menu">
                <button type="button" class="video-option" (click)="promptYoutubeLink()">
                  <ion-icon name="logo-youtube" aria-hidden="true"></ion-icon>
                  <span>YouTube Link</span>
                </button>
                <label class="video-option">
                  <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                  <span>Upload Video</span>
                  <input type="file" accept="video/*" (change)="insertMedia($event, 'video')" hidden />
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>
    </ion-content>

    <ion-footer class="editor-footer">
      <ion-toolbar>
        <p class="draft-status" *ngIf="draftSavedLabel">{{ draftSavedLabel }}</p>
        <div class="footer-buttons">
          <ion-button fill="outline" color="medium" [disabled]="isSaving" (click)="saveDraftManually()">
            SAVE DRAFT
          </ion-button>
          <ion-button expand="block" color="success" [disabled]="isSaving" (click)="saveRecipe()">
            {{ isSaving ? 'SAVING...' : 'PUBLISH RECIPE' }}
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [`
    .editor-page {
      max-width: 700px;
      margin: 0 auto;
      padding: 16px 20px 40px;
    }
    .cover-photo-preview {
      width: 100%;
      max-height: 220px;
      object-fit: cover;
      border-radius: 12px;
      margin-bottom: 12px;
    }
    .recipe-title {
      font-size: 24px;
      font-weight: 700;
      margin: 4px 0 2px;
    }
    .recipe-meta {
      color: #8a8a8a;
      font-size: 13px;
      margin: 0 0 24px;
    }
    .section {
      margin-bottom: 8px;
      padding-bottom: 24px;
    }
    .section + .section {
      border-top: 1px solid #f0f0f0;
      padding-top: 24px;
    }
    .section-label {
      display: block;
      font-weight: 600;
      font-size: 14px;
      color: #333;
      margin-bottom: 10px;
    }
    .flow-field {
      display: block;
      width: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: 16px;
      line-height: 1.6;
      color: #222;
      padding: 0;
      resize: none;
      overflow: hidden;
    }
    textarea.flow-field {
      overflow-y: hidden;
    }
    .flow-field::placeholder {
      color: #aaa;
    }
    .flow-field.editable {
      min-height: 180px;
    }
    .flow-field.editable:empty::before {
      content: attr(data-placeholder);
      color: #aaa;
    }
    .editor-section {
      position: relative;
    }
    .inline-toolbar {
      position: absolute;
      display: flex;
      gap: 10px;
      align-items: center;
      background: white;
      border: 1px solid #eee;
      padding: 4px 8px;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      z-index: 10;
    }
    .toolbar-btn {
      cursor: pointer;
      display: flex;
      align-items: center;
      color: #555;
      font-size: 20px;
    }
    .video-toggle-wrap {
      position: relative;
    }
    .video-options-menu {
      position: absolute;
      top: 28px;
      left: -10px;
      background: white;
      border: 1px solid #eee;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      white-space: nowrap;
      z-index: 20;
    }
    .video-option {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      padding: 6px 10px;
      font-size: 13px;
      font-family: inherit;
      color: #333;
      cursor: pointer;
      border-radius: 6px;
      text-align: left;
    }
    .video-option:hover {
      background: #f7f3ef;
    }
    .video-option ion-icon {
      font-size: 16px;
    }
    .editor-footer ion-toolbar {
      --background: transparent;
      --border-width: 0;
      padding: 8px 20px calc(8px + env(safe-area-inset-bottom));
    }
    .draft-status {
      margin: 0 0 6px;
      text-align: center;
      font-size: 12px;
      color: #8a8a8a;
    }
    .footer-buttons {
      display: flex;
      gap: 10px;

      ion-button {
        margin: 0;
      }

      ion-button[fill="outline"] {
        flex: 0 0 auto;
      }

      ion-button[expand="block"] {
        flex: 1 1 auto;
      }
    }
  `],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonButton, IonIcon, IonFooter
  ]
})
export class RecipeEditorPage implements OnInit, AfterViewInit {
  @ViewChild('editorArea') editorArea!: ElementRef<HTMLDivElement>;

  title: string = '';
  category: string = '';
  description: string = '';
  ingredients: string = '';
  coverPhoto: string | null = null;
  isSaving: boolean = false;

  // Controls where the floating icons appear
  showToolbar: boolean = false;
  showVideoOptions: boolean = false;
  toolbarTop: number = 0;
  toolbarLeft: number = 0;
  savedSelection: Range | null = null;

  draftSavedLabel: string = '';
  // Once this recipe has actually been saved (draft or published), the back
  // button should go Home instead of back to Recipe Setup - Wattpad-style
  savedRecipeId: string | null = null;

  // True when we opened one of the user's existing dishes (/recipe-editor/<id>)
  // rather than starting a new one - only changes the wording on screen
  isEditingExisting: boolean = false;

  private restoredDraftContent: string = '';
  private draftSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private viewReady: boolean = false;
  private currentDraftSessionId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    addIcons({ imageOutline, videocamOutline, logoYoutube, cloudUploadOutline });
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

  // A toast auto-dismisses on its own, so the user isn't stuck tapping "OK"
  // before the app can move on
  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  async ngOnInit() {
    const navigation = this.router.getCurrentNavigation();
    const navState = navigation?.extras.state as any;
    const storedDraft = this.readStoredDraft();

    // Opened as /recipe-editor/<id>: we're continuing an existing dish of our
    // own, not starting a new one
    const editingId = this.route.snapshot.paramMap.get('id');
    if (editingId) {
      // Unsaved local edits for this very dish are fresher than what's in
      // Firestore, so prefer them over re-downloading
      if (storedDraft?.savedRecipeId === editingId) {
        this.applyStoredDraft(storedDraft);
      } else {
        await this.loadRecipeForEditing(editingId);
      }
      return;
    }

    // The browser keeps history.state (and so navState) around across a hard
    // refresh, so its mere presence can't tell "a genuinely new recipe from
    // Recipe Setup" apart from "a reload of this same editing session". A
    // fresh draftSessionId that doesn't match whatever's already stored can.
    const isFreshNavigation = !!navState?.draftSessionId && navState.draftSessionId !== storedDraft?.sessionId;

    if (isFreshNavigation || (navState?.title && !storedDraft)) {
      // A new recipe coming from the Recipe Setup page - start a new draft,
      // discarding anything that was left over from a previous one
      this.currentDraftSessionId = navState?.draftSessionId || null;
      this.title = navState.title || '';
      this.category = navState.category || '';
      this.description = navState.description || '';
      this.coverPhoto = navState.coverPhoto || null;
      this.saveDraftToStorage();
    } else if (storedDraft) {
      // The same editing session as before (e.g. a refresh) - recover it
      this.applyStoredDraft(storedDraft);
    }
  }

  private applyStoredDraft(storedDraft: any) {
    this.currentDraftSessionId = storedDraft.sessionId || null;
    this.title = storedDraft.title || '';
    this.category = storedDraft.category || '';
    this.description = storedDraft.description || '';
    this.ingredients = storedDraft.ingredients || '';
    this.coverPhoto = storedDraft.coverPhoto || null;
    this.restoredDraftContent = storedDraft.contentHtml || '';
    this.savedRecipeId = storedDraft.savedRecipeId || null;
  }

  // Pulls one of the user's own dishes back into the editor. Only the author
  // may do this - the Firestore rules say the same thing, this is just so the
  // app explains itself instead of failing with a permission error.
  private async loadRecipeForEditing(recipeId: string) {
    const auth = getAuth();
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      this.showToast('Please sign in to edit your recipe.', 'danger');
      this.router.navigate(['/login']);
      return;
    }

    try {
      const db = getFirestore();
      const snap = await this.withTimeout(
        getDoc(doc(db, 'recipes', recipeId)),
        20000,
        'Loading this recipe is taking too long. Please check your connection.'
      );

      if (!snap.exists()) {
        this.showToast('That recipe no longer exists.', 'danger');
        this.router.navigate(['/menu']);
        return;
      }

      const data: any = snap.data();
      if (data.authorId !== currentUser.uid) {
        this.showToast('You can only edit your own dishes.', 'danger');
        this.router.navigate(['/recipe', recipeId]);
        return;
      }

      this.isEditingExisting = true;
      this.savedRecipeId = recipeId;
      this.currentDraftSessionId = recipeId;
      this.title = data.title || '';
      this.category = data.category || '';
      this.description = data.description || '';
      this.ingredients = data.ingredients || '';
      this.coverPhoto = data.coverPhoto || null;
      this.restoredDraftContent = data.content || '';
      this.applyRestoredContent();
    } catch (error: any) {
      console.error('Error loading the recipe for editing:', error);
      this.showToast('Could not open that recipe: ' + error.message, 'danger');
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.applyRestoredContent();
  }

  // The saved content can arrive before or after the view exists (a local
  // draft is instant, a Firestore read is not), so both paths call this and
  // whichever happens second is the one that actually writes it in
  private applyRestoredContent() {
    if (!this.viewReady || !this.restoredDraftContent || !this.editorArea) return;
    this.editorArea.nativeElement.innerHTML = sanitizeRecipeHtml(this.restoredDraftContent);
  }

  // Grows the textarea while writing, with no inner scroll
  autoGrow(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  // Tracks where the user's cursor is
  listenCursor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    this.savedSelection = range.cloneRange(); // Save the cursor position

    // Get the (X, Y) coordinates of the cursor on screen
    const rects = range.getClientRects();
    const editorRect = this.editorArea.nativeElement.getBoundingClientRect();

    if (rects.length > 0) {
      // Compute coordinates relative to our editor box
      this.toolbarTop = rects[0].bottom - editorRect.top + 5;
      this.toolbarLeft = rects[0].left - editorRect.left;
      this.showToolbar = true;
    } else {
      // On a fresh blank line, nudge it down a bit based on text height
      this.toolbarTop = this.editorArea.nativeElement.offsetHeight - 40;
      this.toolbarLeft = 15;
      this.showToolbar = true;
    }
    this.showVideoOptions = false;
  }

  toggleVideoOptions() {
    this.showVideoOptions = !this.showVideoOptions;
  }

  // Hides the floating toolbar when the user clicks anywhere outside the
  // editor and outside the toolbar itself - it used to stay stuck open
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.showToolbar) return;

    const target = event.target as HTMLElement;
    const editorEl = this.editorArea?.nativeElement;
    if (editorEl?.contains(target) || target.closest('.inline-toolbar')) {
      return; // handled by listenCursor()/the toolbar's own buttons instead
    }

    this.showToolbar = false;
    this.showVideoOptions = false;
    this.cdr.detectChanges();
  }

  // Inserts the picture/video wherever the cursor is
  async insertMedia(event: any, type: 'image' | 'video') {
    const file = event.target.files[0];
    event.target.value = ''; // Allow re-selecting the same file next time
    if (!file) return;

    try {
      let mediaUrl: string;

      if (type === 'image') {
        // Resize/compress so the embedded image stays well under Firestore's
        // 1 MiB document limit instead of storing the raw (possibly huge) photo
        mediaUrl = await this.resizeImageToDataUrl(file, IMAGE_MAX_DIMENSION, IMAGE_JPEG_QUALITY);
      } else {
        if (file.size > MAX_VIDEO_FILE_BYTES) {
          this.showToast(
            `This video is too large to attach (max ${Math.round(MAX_VIDEO_FILE_BYTES / 1000)}KB for now). ` +
            'Please use a shorter/smaller clip, a YouTube link instead, or add a photo.',
            'danger'
          );
          return;
        }
        mediaUrl = await this.readFileAsDataUrl(file);
      }

      let mediaHtml = '';
      if (type === 'image') {
        mediaHtml = `<br><img src="${mediaUrl}" style="max-width:100%; border-radius:6px; margin: 8px 0;" /><br>`;
      } else {
        mediaHtml = `<br><video src="${mediaUrl}" controls style="max-width:100%; border-radius:6px; margin: 8px 0;"></video><br>`;
      }

      this.insertHtmlAtSavedSelection(mediaHtml);
      this.saveDraftToStorage();
    } catch (error) {
      console.error('Error attaching media:', error);
      this.showToast('Could not attach that file. Try a different one.', 'danger');
    } finally {
      this.showToolbar = false; // Hide the toolbar after inserting
      this.showVideoOptions = false;
      this.cdr.detectChanges(); // This callback runs outside Angular's change detection
    }
  }

  // Lets the user paste a YouTube link instead of uploading a video file
  promptYoutubeLink() {
    this.showVideoOptions = false;
    const url = prompt('Paste the YouTube video link:');
    if (!url) return;

    const videoId = this.extractYoutubeId(url.trim());
    if (!videoId) {
      this.showToast("That doesn't look like a valid YouTube link. Please check the URL and try again.", 'danger');
      return;
    }

    const embedHtml =
      `<br><div class="yt-embed-wrap" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; max-width:100%; margin:8px 0; border-radius:6px; background:#000;">` +
      `<iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` +
      `</div><br>`;

    this.insertHtmlAtSavedSelection(embedHtml);
    this.showToolbar = false;
    this.saveDraftToStorage();
    this.cdr.detectChanges();
  }

  private extractYoutubeId(url: string): string | null {
    const match = url.match(YOUTUBE_URL_PATTERN);
    return match ? match[1] : null;
  }

  // Restores the cursor to where the user last left off, then injects HTML there
  private insertHtmlAtSavedSelection(html: string) {
    const selection = window.getSelection();
    if (this.savedSelection && selection) {
      selection.removeAllRanges();
      selection.addRange(this.savedSelection);
      document.execCommand('insertHTML', false, html);
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }

  private resizeImageToDataUrl(file: File, maxDimension: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Your browser does not support image resizing.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not open the image.'));
      };

      img.src = objectUrl;
    });
  }

  // ----- Draft auto-save, so a refresh doesn't lose progress -----

  scheduleDraftSave() {
    if (this.draftSaveTimeout) {
      clearTimeout(this.draftSaveTimeout);
    }
    this.draftSaveTimeout = setTimeout(() => this.saveDraftToStorage(), 400);
  }

  // Saves this recipe to the user's Library as a draft, instead of just the
  // local-only auto-save copy
  async saveDraftManually() {
    if (this.draftSaveTimeout) {
      clearTimeout(this.draftSaveTimeout);
      this.draftSaveTimeout = null;
    }
    this.saveDraftToStorage(); // keep the local safety-net copy up to date too
    await this.persistRecipe('Draft');
  }

  // Flush any pending save immediately before the page actually unloads/refreshes,
  // so the debounce timer doesn't get cut off mid-wait
  @HostListener('window:beforeunload')
  flushDraftBeforeUnload() {
    if (this.draftSaveTimeout) {
      clearTimeout(this.draftSaveTimeout);
      this.draftSaveTimeout = null;
    }
    this.saveDraftToStorage();
  }

  private saveDraftToStorage() {
    try {
      const draft = {
        sessionId: this.currentDraftSessionId,
        title: this.title,
        category: this.category,
        description: this.description,
        ingredients: this.ingredients,
        coverPhoto: this.coverPhoto,
        contentHtml: this.editorArea?.nativeElement.innerHTML || '',
        savedRecipeId: this.savedRecipeId
      };
      localStorage.setItem(RECIPE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      this.draftSavedLabel = 'Draft saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (this.viewReady) {
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('Could not save the draft locally:', error);
    }
  }

  private readStoredDraft(): any | null {
    try {
      const raw = localStorage.getItem(RECIPE_DRAFT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Could not read the saved draft:', error);
      return null;
    }
  }

  async saveRecipe() {
    await this.persistRecipe('Published');
  }

  // Shared by both "SAVE DRAFT" and "PUBLISH RECIPE" - only the status, the
  // confirmation wording, and where we land afterwards differ between the two
  private async persistRecipe(status: 'Draft' | 'Published'): Promise<void> {
    // Since this uses contenteditable, we grab the content via innerHTML -
    // then strip anything executable (script tags, event handlers, etc.)
    // before it's ever written to Firestore, where any other user could read it
    const finalInstructionsHtml = sanitizeRecipeHtml(this.editorArea.nativeElement.innerHTML);

    if (!this.ingredients.trim() || !finalInstructionsHtml.trim()) {
      this.showToast('Please fill in the ingredients and the steps.', 'danger');
      return;
    }

    // Firestore rejects a document over ~1 MiB. Catch that here with a clear
    // message instead of letting the write fail (or silently hang) later.
    // The cover photo rides along in the same document, so it counts too.
    const contentSizeBytes = new Blob([finalInstructionsHtml]).size + new Blob([this.coverPhoto || '']).size;
    if (contentSizeBytes > MAX_CONTENT_BYTES) {
      this.showToast(
        'This recipe is too large to save (likely due to attached photos/videos). ' +
        'Please use fewer or smaller images.',
        'danger'
      );
      return;
    }

    const auth = getAuth();
    await auth.authStateReady(); // Wait for the existing session to be restored before checking
    const currentUser = auth.currentUser;
    if (!currentUser) {
      this.showToast('Please sign in before saving a recipe.', 'danger');
      this.router.navigate(['/login']);
      return;
    }

    const confirmMessage = status === 'Published'
      ? 'Publish this recipe now? Once published, everyone will be able to see it.'
      : 'Save this recipe as a draft? You can find it later in your Library under "My Dishes".';
    const confirmed = await this.confirmAction(confirmMessage);
    if (!confirmed) {
      return;
    }

    this.isSaving = true;
    this.cdr.detectChanges(); // Firebase calls run outside Angular's change detection
    try {
      const db = getFirestore();

      // Denormalize the author's display name/avatar onto the recipe itself,
      // so the feed can show "by @username" without an extra read per card
      let authorUsername = currentUser.email || 'Anonymous';
      try {
        const userSnap = await this.withTimeout(
          getDoc(doc(db, 'users', currentUser.uid)),
          10000,
          'Could not load your profile info.'
        );
        authorUsername = userSnap.data()?.['username'] || authorUsername;
      } catch (profileError) {
        console.error('Could not load author profile, using a fallback name:', profileError);
      }
      const authorAvatarUrl = localStorage.getItem(AVATAR_STORAGE_PREFIX + currentUser.uid);

      const recipeFields = {
        title: this.title,
        description: this.description,
        category: this.category,
        ingredients: this.ingredients,
        content: finalInstructionsHtml, // This is HTML, pictures included!
        coverPhoto: this.coverPhoto,
        status,
        authorId: currentUser.uid,
        authorEmail: currentUser.email,
        authorUsername,
        authorAvatarUrl
      };
      // A network hiccup (or an unreachable backend) can leave these promises
      // pending forever instead of rejecting - don't let that freeze the UI
      const saveTimeoutMessage = 'The save is taking too long. Please check your connection and try again.';

      // Saving a dish that already exists - SAVE DRAFT then PUBLISH, or a dish
      // reopened from the Library - has to update that same document. Writing
      // a new one every time would leave a duplicate behind on each save.
      // likedBy/savedBy/createdAt are deliberately left alone here.
      if (this.savedRecipeId) {
        await this.withTimeout(
          updateDoc(doc(db, 'recipes', this.savedRecipeId), {
            ...recipeFields,
            updatedAt: serverTimestamp()
          }),
          20000,
          saveTimeoutMessage
        );
      } else {
        const docRef = await this.withTimeout(
          addDoc(collection(db, 'recipes'), {
            ...recipeFields,
            likedBy: [],
            savedBy: [],
            createdAt: serverTimestamp()
          }),
          20000,
          saveTimeoutMessage
        );
        // From now on, the back button should go Home instead of back to Recipe
        // Setup - this recipe is a real, saved dish now, Wattpad-style
        this.savedRecipeId = docRef.id;
      }
      localStorage.removeItem(RECIPE_DRAFT_STORAGE_KEY); // Safely stored now - no more local draft to keep

      // Adds this dish's category to the shared list, so a category the user
      // typed in themselves becomes pickable by everyone else. Fire-and-forget:
      // it handles its own errors, and the recipe is already saved either way.
      void rememberCategory(db, this.category);

      if (status === 'Published') {
        this.showToast('Your recipe was published successfully!');
        this.router.navigate(['/menu']);
      } else {
        this.showToast('Saved to your Library under "My Dishes"!');
        this.router.navigate(['/menu'], { state: { openLibraryTab: 'mydishes' } });
      }
    } catch (error: any) {
      console.error('Error saving the recipe:', error);
      this.showToast('Something went wrong while saving: ' + error.message, 'danger');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges(); // Make sure the button un-sticks from "SAVING..."
    }
  }

  // Races a promise against a timeout so a hung network call can't freeze the
  // UI forever - the original call isn't truly cancelled, but we stop waiting
  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
  }
}
