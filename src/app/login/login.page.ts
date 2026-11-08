import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonButton,
  IonItem,
  IonInput,
  IonIcon,
  ToastController
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGoogle, logoFacebook, mailOutline, lockClosedOutline } from 'ionicons/icons';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonItem,
    IonInput,
    IonIcon
  ]
})
export class LoginPage {
  email: string = '';
  password: string = '';
  isLoggingIn: boolean = false;

  // Keeps the "go back to this recipe afterwards" target alive when the user
  // hops from Login over to Sign Up
  get returnUrlParams(): { returnUrl?: string } {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl ? { returnUrl } : {};
  }

  constructor(private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef, private toastController: ToastController) {
    // Register the social icons used on this page
    addIcons({ logoGoogle, logoFacebook, mailOutline, lockClosedOutline });
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

  async onLogin() {
    if (!this.email || !this.password) {
      this.showToast('Please enter your email and password.', 'danger');
      return;
    }

    this.isLoggingIn = true;
    this.cdr.detectChanges(); // Firebase calls run outside Angular's change detection
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, this.email, this.password);
      // Somebody who came here from a shared recipe link gets sent straight
      // back to that dish instead of the feed
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl || '/menu');
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        this.showToast('Incorrect email or password. Please try again.', 'danger');
      } else if (error.code === 'auth/user-not-found') {
        this.showToast('No account is registered with this email.', 'danger');
      } else if (error.code === 'auth/invalid-email') {
        this.showToast('Your email format is not valid.', 'danger');
      } else if (error.code === 'auth/too-many-requests') {
        this.showToast('Too many failed attempts. Please try again later.', 'danger');
      } else {
        this.showToast('Something went wrong: ' + error.message, 'danger');
      }
    } finally {
      this.isLoggingIn = false;
      this.cdr.detectChanges();
    }
  }

  async onForgotPassword() {
    if (!this.email) {
      this.showToast('Please enter your email above before resetting your password.', 'danger');
      return;
    }
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, this.email);
      this.showToast('A password reset link has been sent to your email.');
    } catch (error: any) {
      console.error('Reset password error:', error);
      this.showToast('Could not send the reset link: ' + error.message, 'danger');
    }
  }

  comingSoon(provider: string) {
    this.showToast(`Sign in with ${provider} is coming soon.`);
  }
}
