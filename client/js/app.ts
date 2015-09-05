﻿/// <reference path="../typings/tsd.d.ts" />

/**
 * URL of the backend API. Currently a local URL, i.e. the static client files are hosted by the API server.
 * In the future the API could be split from the client, which is when the API URL will be made configurable
 */
var apiUrl = "/api";

interface MoneyCirclesRootScope extends ng.IRootScopeService {
    isLoggedIn: boolean;
    // The variables below belong in the login controller. Currently placed here as a workaround to be able to show error
    // message while logging in.
    isProcessingLogin: boolean;
    loginErrorMessage: string;
    userInfo: IUser;
}

module MoneyCircles {
    'use strict';

    // All controllers are registered here.
    var moneyCirclesApp = angular.module('moneyCirclesApp', ['ngResource', 'ngRoute', 'ngSanitize', 'angularMoment'])
        .controller('NavigationController', NavigationController)
        .controller('LoginController', LoginController)
        .controller('UserAccountController', UserAccountController)
        .controller('CircleController', CircleController);

    moneyCirclesApp.config(function ($routeProvider: ng.route.IRouteProvider, $locationProvider: ng.ILocationProvider) {
        $routeProvider
            .when('/', { controller: DashboardController, templateUrl: 'views/dashboard.html' })
            .when('/auth/bitreserve/callback', { controller: LoginController, templateUrl: 'views/login-finished.html' })
            //.when('/user/profile', { controller: UserAccountController, templateUrl: 'views/user-profile.html' })
            .when('/user/login', { controller: LoginController, templateUrl: 'views/login-finished.html' })
            .when('/not-found', { templateUrl: 'views/not-found.html' })
            .when('/circle/new', { controller: CircleController, templateUrl: 'views/circle-form.html' })
            .when('/circle/list', { controller: CircleListController, templateUrl: 'views/circle-list.html' })
            .otherwise({ redirectTo: 'not-found' });
        $locationProvider.html5Mode(true);
        $locationProvider.hashPrefix('!');
    })

    // Note: the string name provided to angular has to match the parameter names as used in the controllers,
    // case-sensitive. 
    moneyCirclesApp.service('identityService', IdentityService);
}

/**
 * Shorthand method for getting an Angular service from the debug console.
 */
function angularGetService(serviceName: string) {
    return angular.element(document.querySelector('.ng-scope')).injector().get(serviceName);
}