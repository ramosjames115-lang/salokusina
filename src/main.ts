import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

// Register Firebase using the configuration from the environment file
const firebaseApp = initializeApp(environment.firebaseConfig);

// Auto-detect when long-polling is needed (when a proxy/firewall blocks the WebChannel)
initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true });

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
}).catch(err => console.error(err));
