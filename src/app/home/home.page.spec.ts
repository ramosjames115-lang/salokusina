import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons'; // Added to register icons
import { restaurant } from 'ionicons/icons'; // Imported the restaurant icon itself

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, 
    IonButton, 
    IonIcon
  ],
})
export class HomePage {
  constructor() {
    // Register the icon here so the HTML can read it
    addIcons({ restaurant });
  }
}
