import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'account-setup',
    loadComponent: () => import('./account-setup/account-setup.page').then((m) => m.AccountSetupPage),
  },
  {
    path: 'menu',
    loadComponent: () => import('./menu/menu.page').then((m) => m.MenuPage),
  },
  {
    path: 'recipe-setup',
    loadComponent: () => import('./recipe-setup/recipe-setup.page').then((m) => m.RecipeSetupPage),
  },
  {
    path: 'recipe-editor',
    loadComponent: () => import('./recipe-editor/recipe-editor.page').then((m) => m.RecipeEditorPage),
  },
  {
    // Same editor, but opening one of your own existing dishes to keep working
    // on it, instead of starting a brand new one
    path: 'recipe-editor/:id',
    loadComponent: () => import('./recipe-editor/recipe-editor.page').then((m) => m.RecipeEditorPage),
  },
  {
    path: 'recipe/:id',
    loadComponent: () => import('./recipe-detail/recipe-detail.page').then((m) => m.RecipeDetailPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];