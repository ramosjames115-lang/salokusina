export const environment = {
  production: false,
  // Used for share/QR links when running as a native app (Capacitor), where
  // window.location.origin is just the local webview, not a real address.
  // This is the project's default Firebase Hosting domain - `firebase deploy
  // --only hosting` must be run at least once for these links to resolve.
  appUrl: 'https://salo-kusina-e2fe3.web.app',
  firebaseConfig: {
    apiKey: "AIzaSyCWbcLaiJYrAyhAQYrse316F2DxO9SxHrI",
    authDomain: "salo-kusina-e2fe3.firebaseapp.com",
    projectId: "salo-kusina-e2fe3",
    storageBucket: "salo-kusina-e2fe3.firebasestorage.app",
    messagingSenderId: "658195956502",
    appId: "1:658195956502:web:2db5e068c009a0b448c637"
  }
};
