/// <reference path="typings/tsd.d.ts" />
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var path = require('path');
var fs = require('fs');
var indexRoute = require('./routes/index');
// TODO: make configurable
var HTTP_PORT = 3123;
var HTTPS_PORT = HTTP_PORT + 1;
var baseUrl = "https://localhost:" + HTTPS_PORT;
// OAuth controllers
var githubConfig = {
    baseUrl: baseUrl,
    basePath: "/api/auth/github",
    clientID: 'f117ca3a3a913dab3698',
    clientSecret: '1c36a181dc91dacf275b0f1fc8b6fdb65ed92ec9',
    scope: 'notifications',
    oauthSite: "https://github.com/login",
    oauthTokenPath: '/oauth/access_token',
    oauthAuthorizationPath: '/oauth/authorize',
};
var githubOauthController = require('./controllers/oauthController')(githubConfig);
var bitReserveConfig = {
    baseUrl: baseUrl,
    basePath: "/api/auth/bitreserve",
    clientID: 'e75aef1e3bfc8f6f49fcf4f1ebf0bbf30dd8988c',
    clientSecret: 'b3df38816602d936c304774c43420d56eda8358f',
    scope: "cards:read,cards:write,transactions:read,transactions:write,user:read",
    // BitReserve uses a different domain for the authorization URL. simple-oauth2 doesn't support that.
    // The "site" parameter also may not be empty.
    // As a workaround, we use the greatest common denominator of the two URLs: "https://".
    oauthSite: "https://",
    oauthTokenPath: 'api.bitreserve.org/oauth2/token',
    oauthAuthorizationPath: 'bitreserve.org/authorize/' + 'e75aef1e3bfc8f6f49fcf4f1ebf0bbf30dd8988c',
};
var bitReserveOauthController = require('./controllers/oauthController')(bitReserveConfig);
var bitReserveService = require('./services/bitReserveService');
/**
 * Create a new BitReserve service and get user info from it.
 */
function getBitReserveUserInfo(token, callback) {
    var brs = new bitReserveService.bitReserveService(token);
    brs.getUser(callback);
}
bitReserveOauthController.setGetUserInfoFunction(getBitReserveUserInfo);
var app = express();
app.use(bodyParser.json());
// Logging
var morgan = require('morgan');
app.use(morgan('dev'));
// TODO: store Mongo config in config file.
// TODO: make it work offline
var db = mongoose.connect("mongodb://moneycircles-bitreserve-poc-dev-user:iPBNE0ZeQRPbsHOVWEUi@ds035593.mongolab.com:35593/moneycircles-bitreserve-poc-dev");
// Client folder containing the Angular SPA, serve as static assets
var clientDir = path.join(__dirname, 'client');
app.use(express.static(clientDir));
// All routes which are directly accessible (i.e. not only from within the Angular SPA).
// All open index.html, where Angular handles further routing to the right controller/ view.
// Ideally all routes not matched by server-side routes are forwarded to Angular.
// TODO: introduce an "other" wildcard handler for this.
app.get('/', indexRoute.index);
app.get('/user/profile', indexRoute.index);
//app.get('/users', userController.list);
//app.get('/users/:name', userController.retrieveUser);
//app.post('/users/:name', userController.createUser);
// TODO: make TypeScript check validity of these calls, on local files that are called using require() and 
// expose their functions in module.exports.
app.get(githubOauthController.getAuthRoute(), githubOauthController.auth);
app.post(githubOauthController.getCallbackApiRoute(), githubOauthController.callback);
app.get(githubOauthController.getCallbackPublicRoute(), indexRoute.index);
app.get(bitReserveOauthController.getAuthRoute(), bitReserveOauthController.auth);
app.post(bitReserveOauthController.getCallbackApiRoute(), bitReserveOauthController.callback);
app.get(bitReserveOauthController.getCallbackPublicRoute(), indexRoute.index);
// BitReserve API wrapper
var bitReserveController = require('./controllers/bitReserveController');
var brc = new bitReserveController.bitReserveController();
app.get("/api/bitreserve/me/cards", brc.getCards);
var httpsOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};
var http = require('http');
var https = require('https');
http.createServer(app).listen(HTTP_PORT);
https.createServer(httpsOptions, app).listen(HTTPS_PORT);
console.log('http server started on port ' + HTTP_PORT);
console.log('https server started on port ' + HTTPS_PORT);
//# sourceMappingURL=server.js.map