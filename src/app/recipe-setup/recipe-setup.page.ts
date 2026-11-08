import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getFirestore } from 'firebase/firestore';
import {
  CategoryOption, DEFAULT_CATEGORIES, loadCategoryCatalog, normalizeCategoryName
} from '../shared/category-catalog';

// Picked from the category dropdown to type in a brand new category instead
const OTHER_CATEGORY = '__other__';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonItem, IonInput,
  IonTextarea, IonButton, IonSelect, IonSelectOption,
  IonIcon, ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline } from 'ionicons/icons';

const COVER_MAX_DIMENSION = 800;
const COVER_JPEG_QUALITY = 0.75;

@Component({
  selector: 'app-recipe-setup',
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar class="setup-toolbar">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/menu" color="dark"></ion-back-button>
        </ion-buttons>
        <ion-title class="setup-title">Recipe Setup</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" class="ion-padding bg-light-orange">
      <div class="setup-container">

        <div class="welcome-text" style="margin-bottom: 20px;">
          <h2>Prepare Your Recipe</h2>
          <p>Fill in the key details first before you start writing.</p>
        </div>

        <!-- Cover Photo -->
        <label class="cover-photo-picker">
          <img *ngIf="coverPhotoPreview" [src]="coverPhotoPreview" alt="Cover preview" class="cover-photo-img" />
          <div *ngIf="!coverPhotoPreview" class="cover-photo-placeholder">
            <ion-icon name="camera-outline"></ion-icon>
            <span>Add a Cover Photo (optional)</span>
          </div>
          <input type="file" accept="image/*" (change)="onCoverPhotoSelected($event)" hidden />
        </label>

        <!-- Recipe Setup Form -->
        <div class="setup-form">

          <!-- Dish Name -->
          <ion-item lines="none" style="margin-bottom: 15px;">
            <ion-input type="text" placeholder="Dish Name (Title)" [(ngModel)]="title"></ion-input>
          </ion-item>

          <!-- Category Selection. The list comes from the database, so every
               category anybody has used shows up here (see category-catalog.ts) -->
          <ion-item lines="none" style="margin-bottom: 15px;">
            <ion-select placeholder="Choose a Category" [(ngModel)]="category" mode="ios">
              @for (cat of categories; track cat.name) {
                <ion-select-option [value]="cat.name">{{ cat.name }}</ion-select-option>
              }
              <ion-select-option [value]="OTHER_CATEGORY">Other (type my own)</ion-select-option>
            </ion-select>
          </ion-item>

          <!-- Only appears once "Other" is picked -->
          @if (category === OTHER_CATEGORY) {
            <ion-item lines="none" style="margin-bottom: 15px;">
              <ion-input
                type="text"
                placeholder="Your own category (e.g. Street Food)"
                [(ngModel)]="customCategory"></ion-input>
            </ion-item>
          }

          <!-- Short Description -->
          <ion-item lines="none" style="margin-bottom: 20px;">
            <ion-textarea rows="4" placeholder="Short Description" [(ngModel)]="description"></ion-textarea>
          </ion-item>

          <!-- Start Writing Button -->
          <div class="btn-group">
            <ion-button expand="block" (click)="startWriting()">
              START WRITING
            </ion-button>
          </div>

        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    .cover-photo-picker {
      display: block;
      cursor: pointer;
      margin-bottom: 20px;
    }
    .cover-photo-img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-radius: 12px;
    }
    .cover-photo-placeholder {
      width: 100%;
      height: 180px;
      border-radius: 12px;
      border: 2px dashed #f48240;
      background: #fff3e8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #f48240;
      font-weight: 600;
      font-size: 14px;

      ion-icon {
        font-size: 32px;
      }
    }
  `],
  styleUrls: ['./recipe-setup.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonItem, IonInput,
    IonTextarea, IonButton, IonSelect, IonSelectOption,
    IonIcon
  ]
})
export class RecipeSetupPage implements OnInit {
  title: string = '';
  category: string = '';
  description: string = '';

  // The sentinel value behind the "Other (type my own)" option
  readonly OTHER_CATEGORY = OTHER_CATEGORY;
  customCategory: string = '';

  // Starts as the built-in list, then gets replaced by whatever is actually in
  // the database once that load finishes
  categories: CategoryOption[] = DEFAULT_CATEGORIES;

  coverPhotoDataUrl: string | null = null;
  coverPhotoPreview: string | null = null;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toastController: ToastController
  ) {
    addIcons({ cameraOutline });
  }

  async ngOnInit() {
    try {
      this.categories = await loadCategoryCatalog(getFirestore());
    } catch (error) {
      console.error('Could not load the category list:', error);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  // What actually gets saved on the recipe: either the picked category, or the
  // one the user typed in under "Other". An existing category typed by hand
  // (e.g. "filipino") is folded back into its official spelling so we don't end
  // up with two versions of the same category.
  private resolveCategory(): string {
    if (this.category !== OTHER_CATEGORY) return this.category;

    const typed = normalizeCategoryName(this.customCategory);
    if (!typed) return '';
    const known = this.categories.find((cat) => cat.name.toLowerCase() === typed.toLowerCase());
    return known ? known.name : typed;
  }

  async onCoverPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await this.resizeImageToDataUrl(file, COVER_MAX_DIMENSION, COVER_JPEG_QUALITY);
      this.coverPhotoDataUrl = dataUrl;
      this.coverPhotoPreview = dataUrl;
    } catch (error) {
      console.error('Error processing the cover photo:', error);
      this.showToast('Could not open that image. Try a different file.', 'danger');
    }
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

  private async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({ message, duration: 2200, color, position: 'bottom' });
    await toast.present();
  }

  startWriting() {
    const category = this.resolveCategory();

    if (!this.title.trim() || !category || !this.description.trim()) {
      this.showToast('Please fill in the title, category, and description.', 'danger');
      return;
    }

    // Pass the data along to the recipe-editor page. draftSessionId is a fresh
    // id every time - it's how the editor tells "a genuinely new recipe" apart
    // from "a refresh of the same browser tab", since the browser keeps
    // history.state (and so this same data) around across a hard refresh too.
    this.router.navigate(['/recipe-editor'], {
      state: {
        title: this.title,
        category,
        description: this.description,
        coverPhoto: this.coverPhotoDataUrl,
        draftSessionId: Date.now().toString(36) + Math.random().toString(36).slice(2)
      }
    });
  }
}
