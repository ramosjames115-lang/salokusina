import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import {
  IonContent, IonHeader, IonTitle, IonToolbar,
  IonButton, IonItem, IonInput, IonIcon,
  AlertController, ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, callOutline, calendarOutline } from 'ionicons/icons';
import { getAuth, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadCategoryCatalog } from '../shared/category-catalog';
import { buildInterestGroups, INTEREST_GROUPS, InterestGroup } from '../shared/interest-catalog';

const AVATAR_MAX_DIMENSION = 512;
const AVATAR_JPEG_QUALITY = 0.82;

// Firebase Storage isn't enabled for this project yet, so for now we save
// the profile picture in the browser's localStorage (key: avatar_<uid>).
export const AVATAR_STORAGE_PREFIX = 'salokusina_avatar_';

@Component({
  selector: 'app-account-setup',
  templateUrl: './account-setup.page.html',
  styleUrls: ['./account-setup.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent, IonHeader, IonTitle, IonToolbar,
    IonButton, IonItem, IonInput, IonIcon
  ]
})
export class AccountSetupPage implements OnInit {
  displayName: string = 'User Profile'; // Default name placeholder
  username: string = '';
  phoneNumber: string = '';
  birthday: string = '';
  isSaving: boolean = false;

  // The food this user is into. Saved on their profile and used to order
  // "Top Dishes For You" on the Home feed.
  interestGroups: InterestGroup[] = INTEREST_GROUPS;
  selectedInterests: string[] = [];

  avatarDataUrl: string | null = null;
  avatarPreview: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    addIcons({ cameraOutline, callOutline, calendarOutline });
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

  // Races a promise against a timeout so a hung network call can't freeze the
  // UI forever - the original call isn't truly cancelled, but we stop waiting
  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
  }

  async ngOnInit() {
    // Get the name passed in from the Register screen
    const savedName = localStorage.getItem('registeredFullName');
    if (savedName) {
      this.displayName = savedName;
    }

    // The fixed interest groups, plus any category in the database that they
    // don't already cover - so a category somebody invented is offered here too
    try {
      this.interestGroups = buildInterestGroups(await loadCategoryCatalog(getFirestore()));
    } catch (error) {
      console.error('Could not load the category list:', error);
    } finally {
      this.cdr.detectChanges(); // Firestore calls run outside Angular's change detection
    }
  }

  isInterestSelected(name: string): boolean {
    return this.selectedInterests.includes(name);
  }

  toggleInterest(name: string) {
    this.selectedInterests = this.isInterestSelected(name)
      ? this.selectedInterests.filter((interest) => interest !== name)
      : [...this.selectedInterests, name];
  }

  // Called when the user picks an image for their profile picture
  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      // Resize the image first so only a small version is saved in localStorage
      const resized = await this.resizeImage(file, AVATAR_MAX_DIMENSION, AVATAR_JPEG_QUALITY);
      const dataUrl = await this.blobToDataUrl(resized);

      this.avatarDataUrl = dataUrl;
      this.avatarPreview = dataUrl;
    } catch (error) {
      console.error('Error processing the image:', error);
      this.showToast('Could not open the selected image. Try a different file.', 'danger');
    } finally {
      this.cdr.detectChanges(); // Image loading/resizing runs outside Angular's change detection
    }
  }

  // Resizes the image using a canvas before converting it to a small JPEG blob
  private resizeImage(file: File, maxDimension: number, quality: number): Promise<Blob> {
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

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not convert the image.'))),
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not open the image.'));
      };

      img.src = objectUrl;
    });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not convert the image.'));
      reader.readAsDataURL(blob);
    });
  }

  async onSaveSetup() {
    if (!this.username) {
      this.showToast('Please choose your desired @username.', 'danger');
      return;
    }
    if (!this.phoneNumber) {
      this.showToast('Please enter your mobile number.', 'danger');
      return;
    }
    if (this.selectedInterests.length === 0) {
      this.showToast('Please pick at least one food interest.', 'danger');
      return;
    }

    const auth = getAuth();
    await auth.authStateReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      this.showToast('Please sign in before continuing with account setup.', 'danger');
      this.router.navigate(['/login']);
      return;
    }

    const confirmed = await this.confirmAction('Save this profile information and continue?');
    if (!confirmed) {
      return;
    }

    this.isSaving = true;
    this.cdr.detectChanges(); // Firebase calls run outside Angular's change detection
    try {
      // Save the profile picture in the browser's localStorage while Firebase
      // Storage isn't enabled for this project yet.
      if (this.avatarDataUrl) {
        try {
          localStorage.setItem(AVATAR_STORAGE_PREFIX + currentUser.uid, this.avatarDataUrl);
        } catch (storageError) {
          console.error('Could not save the image to localStorage:', storageError);
          this.showToast('The image is too large to save locally. Try a smaller file.', 'danger');
          this.isSaving = false;
          return;
        }
      }

      // A network hiccup (or an unreachable backend) can leave these promises
      // pending forever instead of rejecting - don't let that freeze the UI
      await this.withTimeout(
        updateProfile(currentUser, { displayName: this.username }),
        20000,
        'The save is taking too long. Please check your connection and try again.'
      );

      const db = getFirestore();
      await this.withTimeout(
        setDoc(doc(db, 'users', currentUser.uid), {
          fullName: this.displayName,
          username: this.username,
          email: currentUser.email,
          phoneNumber: this.phoneNumber,
          birthday: this.birthday,
          interests: this.selectedInterests,
          hasLocalAvatar: !!this.avatarDataUrl,
          updatedAt: serverTimestamp()
        }, { merge: true }),
        20000,
        'The save is taking too long. Please check your connection and try again.'
      );

      this.showToast(`Welcome to Salo Kusina, @${this.username.toLowerCase()}!`);
      // If they signed up just to read a shared recipe, drop them on that dish
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl || '/menu');
    } catch (error: any) {
      console.error('Error saving account setup:', error);
      this.showToast('Something went wrong while saving: ' + error.message, 'danger');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }
}
