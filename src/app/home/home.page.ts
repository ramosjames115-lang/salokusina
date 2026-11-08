import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonContent, IonButton, IonIcon, IonRouterLink } from '@ionic/angular'; // Imported IonRouterLink here
import { addIcons } from 'ionicons';
import { restaurant } from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonRouterLink, // Added here to the imports list
    IonContent, 
    IonButton, 
    IonIcon
  ],
})
export class HomePage {
  constructor() {
    addIcons({ restaurant });
  }
}
