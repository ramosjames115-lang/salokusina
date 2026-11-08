import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
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
import { personOutline, mailOutline, lockClosedOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';

// Import the Firebase Authentication tools
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
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
export class RegisterPage {
  fullName: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  showPassword: boolean = false;

  // Keeps the "go back to this recipe afterwards" target alive through
  // Sign Up -> Account Setup, and across the link over to Login
  get returnUrlParams(): { returnUrl?: string } {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl ? { returnUrl } : {};
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {
    addIcons({ personOutline, mailOutline, lockClosedOutline, eyeOutline, eyeOffOutline });
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

  // Estimates password strength as the user types
  get passwordStrength(): 'weak' | 'medium' | 'strong' | '' {
    const pw = this.password;
    if (!pw) return '';

    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    const variety = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (pw.length < 6 || variety < 2) return 'weak';
    if (pw.length >= 8 && variety >= 3) return 'strong';
    return 'medium';
  }

  get passwordStrengthLabel(): string {
    switch (this.passwordStrength) {
      case 'weak': return 'Weak Password';
      case 'medium': return 'Medium Password';
      case 'strong': return 'Strong Password';
      default: return '';
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async onRegister() {
    // 1. Make sure all fields are filled in
    if (!this.fullName || !this.email || !this.password || !this.confirmPassword) {
      this.showToast('Please fill in all required details.', 'danger');
      return;
    }

    // 2. Check the email format (needs an @ and a valid domain)
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(this.email)) {
      this.showToast('Your email format is invalid. Make sure it has an @ and a domain (e.g. name@gmail.com)', 'danger');
      return;
    }

    // 3. Check that the passwords match
    if (this.password !== this.confirmPassword) {
      this.showToast('Your Password and Confirm Password do not match.', 'danger');
      return;
    }

    if (this.password.length < 6) {
      this.showToast('Your password must be at least 6 characters long.', 'danger');
      return;
    }

    const hasSpecialChar = /[^A-Za-z0-9]/.test(this.password);
    if (!hasSpecialChar) {
      this.showToast('Your password must include a special character (e.g. ! @ # $ % &).', 'danger');
      return;
    }

    // 4. Send to Firebase
    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, this.email, this.password);
      console.log('User registered successfully:', userCredential.user);

      // Save the full name so the Account Setup page can read it
      localStorage.setItem('registeredFullName', this.fullName);

      this.showToast('Your account was created successfully!');

      // Go straight to account setup instead of /home, carrying along the
      // recipe they were trying to read (if they came from a shared link)
      this.router.navigate(['/account-setup'], { queryParams: this.returnUrlParams });
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        this.showToast('This email address is already used by another account.', 'danger');
      } else if (error.code === 'auth/invalid-email') {
        this.showToast('Firebase did not accept your email format.', 'danger');
      } else {
        this.showToast('Something went wrong: ' + error.message, 'danger');
      }
    }
  }
}
