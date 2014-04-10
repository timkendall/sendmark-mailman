var UserApp = window.UserApp || {};

// Backward compatibility support
// Provide a console log/error method if not available
if(!window.console){
	window.console = {};
	if(!window.console.log){
		window.console.log = function(){};
		window.console.error = function(){};
	}
}

// Global settings
UserApp.global = {
	baseAddress: null,
	appId:null,
	token:null,
	debug: false,
	secure: false
};

// Transport
// The layer which handles the communication with UserApp.

UserApp.Transport = {Current: null};

UserApp.Transport.encodeArguments = function(source, prefix, skipIndex){
    var result = [];
    
    for(var index in source){
        var value = source[index];
        var key = prefix ? prefix + "[" + index + "]" : index;

        // Skip Angular.js hashkeys
        if(key == '$$hashKey' || index == '$$hashKey'){
        	continue;
        }

        // Skip null values
        if(value === undefined || value === null){
        	// Except if they are 'special' ($ initial)
	        if(key && key.length > 0 && key[0] == '$'){
	        	result.push(key);
	        }
        	continue;
        }

        result.push(typeof value == "object" ?
        	UserApp.Transport.encodeArguments(value, key, value instanceof Array) :
        	key + "=" + encodeURIComponent(value)
    	);
    }

    return result.join("&");
};

var JsonpTransport = UserApp.Transport.JsonpTransport = function(baseAddress, msTimeout){
	this.offset = 0;
	this.callbacks = {};
	this.baseAddress = baseAddress || UserApp.global.baseAddress;
	this.msTimeout = msTimeout || 1000*20;
};

JsonpTransport.prototype.call = function(sender, version, method, arguments, callback, visit){
	var outerScope = this;
	sender = sender || UserApp.global;

	var cleanupRequest = null;
	var timeoutCallback = null;

	var timestamp = Math.floor((new Date().getTime()/1000)-1373133713); // Cache buster (seconds since UserApp epoch!)
	var callbackId = 'ua_' + (++this.offset) + '_' + timestamp;

	var serviceArguments = {};
	serviceArguments["app_id"] = sender.appId || UserApp.global.appId;
	serviceArguments["token"] = sender.token || UserApp.global.token;

	if(arguments){
		for(var key in arguments){
			serviceArguments[key] = arguments[key];
		}
	}

	serviceArguments["js_callback"] = callbackId;

	if(UserApp.global.debug){
		serviceArguments["$beautify"] = null;
		serviceArguments["$debug"] = null;
	}

	// If we're in debug mode. Provide a default callback if not provided.
	if(UserApp.global.debug){
		console.log("Calling method " + method + " with arguments " + JSON.stringify(serviceArguments));
		var shadowedCallback = callback;
		callback = function(error, result){
			if(error){
				console.error("UserApp error: " + error.name + ": " + error.message);
			}

			console.log(result);

			if(shadowedCallback){
				shadowedCallback(error, result);
			}
		}
	}

	var protocol = UserApp.global.secure ? 'https' : 'http';
	var encodedArguments = UserApp.Transport.encodeArguments(serviceArguments);
	var requestUrl = protocol + "://" + this.baseAddress + "/v" + version + "/" + method + "?" + encodedArguments;

	if(visit){
		document.location = requestUrl;
		return;
	}

    var script = document.createElement('script');

    script.setAttribute('async', true);
    script.setAttribute('src', requestUrl);
    script.setAttribute('type', 'text/javascript');

    if(callback){
	    this.callbacks[callbackId] = callback;

	    cleanupRequest = function(){
	    	delete window[callbackId];
	    	delete outerScope.callbacks[callbackId];
	    };
	    
	    timeoutCallback = setTimeout(function(){
	    	outerScope.callbacks[callbackId]({name:'TIMED_OUT', message:'Request timed out'});
	    	cleanupRequest();
	    }, this.msTimeout);
	}

    window[callbackId] = function(result){
    	var logs = null;

		if(result.__logs){
			logs = result.__logs;
			delete result["__logs"];
		}

		if (result instanceof Array) {
			if(result.length > 0){
				var lastChild = result[result.length-1];
				if(lastChild && lastChild.__logs){
					logs = result.pop().__logs;
				}
			}
		}

		if(logs && UserApp.global.debug){
			for(var i=0;i<logs.length;++i){
				var log = logs[i];
				var message = typeof log.message == 'object' ? JSON.stringify(log.message) : log.message;
				console.log("UserApp " + log.type + ": " + message);
			}
			logs = null;
		}

    	if(callbackId in outerScope.callbacks){
	    	if(timeoutCallback){
	    		clearTimeout(timeoutCallback);
    		}

	    	if(result.error_code){
	    		outerScope.callbacks[callbackId]({name: result.error_code, message: result.message});
	    	}else{
	    		outerScope.callbacks[callbackId](null, result);
	    	}

	    	if(cleanupRequest){
	    		cleanupRequest();
	    	}
    	}
    };

    document.getElementsByTagName('head')[0]
    	.appendChild(script);
};

// Helper function used to initialize the library.
UserApp.initialize = function(settings){
	this.setAppId(settings.appId);
	this.setToken(settings.token);
	this.setBaseAddress(settings.baseAddress);
	this.setDebug(settings.debug);
	this.setSecure(settings.secure);
	return this;
};

// Set which base address to call. E.g. 'api.userapp.io'.
UserApp.setBaseAddress = function(address){
	this.global.baseAddress = address || 'api.userapp.io';
	UserApp.Transport.Current = new UserApp.Transport.JsonpTransport();
	return this;
}

// Set which application to authenticate under.
UserApp.setAppId = function(appId){
	this.global.appId = appId;
	return this;
};

// Set which token to work against
UserApp.setToken = function(token){
	this.global.token = token;
	return this;
};

// Activate debugging. Enables user to receive errors/logs/results in console.
UserApp.setDebug = function(debug){
	this.global.debug = debug || false;
};

// Whether or not to use SSL. Default = true
UserApp.setSecure = function(secure){
	this.global.secure = secure == null || secure == undefined ? true : secure;
};

// User

UserApp.User = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Search for users

UserApp.User.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.search', arguments, callback);
};

UserApp.User.prototype.search = function(arguments, callback){
	UserApp.User.search(arguments, callback);
};

// Save a user

UserApp.User.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.save', arguments, callback);
};

UserApp.User.prototype.save = function(arguments, callback){
	UserApp.User.save(arguments, callback);
};

// Get a specific user

UserApp.User.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.get', arguments, callback);
};

UserApp.User.prototype.get = function(arguments, callback){
	UserApp.User.get(arguments, callback);
};

// Count number of users

UserApp.User.count = function(arguments, callback){
	if(typeof arguments == 'function'){
		callback = arguments;
		arguments = null;
	}
	
	UserApp.Transport.Current.call(this, 1, 'user.count', arguments, callback);
};

UserApp.User.prototype.count = function(arguments, callback){
	UserApp.User.count(arguments, callback);
};

// Remove

UserApp.User.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.remove', arguments, callback);
};

UserApp.User.prototype.remove = function(callback){
	UserApp.User.remove(callback);
};

// Change password

UserApp.User.resetPassword = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.resetPassword', arguments, callback);
};

UserApp.User.prototype.resetPassword = function(arguments, callback){
	UserApp.User.resetPassword(arguments, callback);
};

// Change password

UserApp.User.changePassword = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.changePassword', arguments, callback);
};

UserApp.User.prototype.changePassword = function(arguments, callback){
	UserApp.User.changePassword(arguments, callback);
};

// Verify Email

UserApp.User.verifyEmail = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.verifyEmail', arguments, callback);
};

UserApp.User.prototype.verifyEmail = function(arguments, callback){
	UserApp.User.verifyEmail(arguments, callback);
};

// Request Email Verification

UserApp.User.requestEmailVerification = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.requestEmailVerification', arguments, callback);
};

UserApp.User.prototype.requestEmailVerification = function(arguments, callback){
	UserApp.User.requestEmailVerification(arguments, callback);
};

// Plan

UserApp.User.setPlan = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.setPlan', arguments, callback);
};

UserApp.User.prototype.setPlan = function(arguments, callback){
	UserApp.User.setPlan(arguments, callback);
};

// Get subscription details

UserApp.User.getSubscriptionDetails = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.getSubscriptionDetails', arguments, callback);
};

UserApp.User.prototype.getSubscriptionDetails = function(arguments, callback){
	UserApp.User.getSubscriptionDetails(arguments, callback);
};

// Lock

UserApp.User.lock = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.lock', arguments, callback);
};

UserApp.User.prototype.lock = function(arguments, callback){
	UserApp.User.setLock(arguments, callback);
};

// Unlock

UserApp.User.unlock = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.unlock', arguments, callback);
};

UserApp.User.prototype.unlock = function(arguments, callback){
	UserApp.User.unlock(arguments, callback);
};

// Has Permission

UserApp.User.hasPermission = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.hasPermission', arguments, callback);
};

UserApp.User.prototype.hasPermission = function(arguments, callback){
	UserApp.User.hasPermission(arguments, callback);
};

// Has Feature

UserApp.User.hasFeature = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.hasFeature', arguments, callback);
};

UserApp.User.prototype.hasFeature = function(arguments, callback){
	UserApp.User.hasFeature(arguments, callback);
};

// Login

UserApp.User.login = function(arguments, callback){
	var outerScope = this;
	UserApp.Transport.Current.call(this, 1, 'user.login', arguments, function(error, result){
		if(!error){
			var token = result.token;
			if(typeof outerScope === 'object'){
				outerScope.token = token;
			}else{
				UserApp.setToken(token);
			}
		}

		callback && callback(error, result);
	});
};

UserApp.User.prototype.login = function(arguments, callback){
	UserApp.User.login(arguments, callback);
};

// Logout

UserApp.User.logout = function(callback){
	UserApp.Transport.Current.call(this, 1, 'user.logout', null, function(error, result){
		UserApp.setToken(null);
		callback && callback(error, result);
	});
};

UserApp.User.prototype.logout = function(callback){
	UserApp.User.logout(callback);
};

// Token

UserApp.Token = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get token

UserApp.Token.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'token.get', arguments, callback);
};

UserApp.Token.prototype.get = function(arguments, callback){
	UserApp.Token.get(arguments, callback);
};

// Search token

UserApp.Token.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'token.search', arguments, callback);
};

UserApp.Token.prototype.search = function(arguments, callback){
	UserApp.Token.search(arguments, callback);
};

// Save token

UserApp.Token.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'token.save', arguments, callback);
};

UserApp.Token.prototype.save = function(arguments, callback){
	UserApp.Token.save(arguments, callback);
};

// Remove token

UserApp.Token.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'token.remove', arguments, callback);
};

UserApp.Token.prototype.remove = function(arguments, callback){
	UserApp.Token.remove(arguments, callback);
};

// Heartbeat
// Keep a session token alive

UserApp.Token.heartbeat = function(callback){
	UserApp.Transport.Current.call(this, 1, 'token.heartbeat', null, callback);
};

UserApp.Token.prototype.heartbeat = function(callback){
	UserApp.Token.heartbeat(callback);
};

// Permission

UserApp.Permission = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get a permission

UserApp.Permission.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'permission.get', arguments, callback);
};

UserApp.Permission.prototype.get = function(arguments, callback){
	UserApp.Permission.get(arguments, callback);
};

// Search permission

UserApp.Permission.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'permission.search', arguments, callback);
};

UserApp.Permission.prototype.search = function(arguments, callback){
	UserApp.Permission.search(arguments, callback);
};

// Save a permission

UserApp.Permission.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'permission.save', arguments, callback);
};

UserApp.Permission.prototype.save = function(arguments, callback){
	UserApp.Permission.save(arguments, callback);
};

// Count number of permissions

UserApp.Permission.count = function(callback){
	UserApp.Transport.Current.call(this, 1, 'permission.count', null, callback);
};

UserApp.Permission.prototype.count = function(callback){
	UserApp.Permission.count(arguments, callback);
};

// Remove a specific permission

UserApp.Permission.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'permission.remove', arguments, callback);
};

UserApp.Permission.prototype.remove = function(callback){
	UserApp.Permission.remove(callback);
};

// Feature

UserApp.Feature = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get a feature

UserApp.Feature.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'feature.get', arguments, callback);
};

UserApp.Feature.prototype.get = function(arguments, callback){
	UserApp.Feature.get(arguments, callback);
};

// Search feature

UserApp.Feature.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'feature.search', arguments, callback);
};

UserApp.Feature.prototype.search = function(arguments, callback){
	UserApp.Feature.search(arguments, callback);
};

// Save a feature

UserApp.Feature.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'feature.save', arguments, callback);
};

UserApp.Feature.prototype.save = function(arguments, callback){
	UserApp.Feature.save(arguments, callback);
};

// Count number of features

UserApp.Feature.count = function(callback){
	UserApp.Transport.Current.call(this, 1, 'feature.count', null, callback);
};

UserApp.Feature.prototype.count = function(callback){
	UserApp.Feature.count(arguments, callback);
};

// Remove a specific feature

UserApp.Feature.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'feature.remove', arguments, callback);
};

UserApp.Feature.prototype.remove = function(callback){
	UserApp.Feature.remove(callback);
};

// Property

UserApp.Property = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get a property

UserApp.Property.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'property.get', arguments, callback);
};

UserApp.Property.prototype.get = function(arguments, callback){
	UserApp.Property.get(arguments, callback);
};

// Search property

UserApp.Property.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'property.search', arguments, callback);
};

UserApp.Property.prototype.search = function(arguments, callback){
	UserApp.Property.search(arguments, callback);
};

// Save a property

UserApp.Property.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'property.save', arguments, callback);
};

UserApp.Property.prototype.save = function(arguments, callback){
	UserApp.Property.save(arguments, callback);
};

// Count number of propertys

UserApp.Property.count = function(callback){
	UserApp.Transport.Current.call(this, 1, 'property.count', null, callback);
};

UserApp.Property.prototype.count = function(callback){
	UserApp.Property.count(arguments, callback);
};

// Remove a specific property

UserApp.Property.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'property.remove', arguments, callback);
};

UserApp.Property.prototype.remove = function(callback){
	UserApp.Property.remove(callback);
};

// PriceList

UserApp.PriceList = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get a pricelist

UserApp.PriceList.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'priceList.get', arguments, callback);
};

UserApp.PriceList.prototype.get = function(arguments, callback){
	UserApp.PriceList.get(arguments, callback);
};

// Search pricelist

UserApp.PriceList.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'priceList.search', arguments, callback);
};

UserApp.PriceList.prototype.search = function(arguments, callback){
	UserApp.PriceList.search(arguments, callback);
};

// Update a specific pricelist

UserApp.PriceList.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'priceList.save', arguments, callback);
};

UserApp.PriceList.prototype.save = function(arguments, callback){
	UserApp.PriceList.save(arguments, callback);
};

// Count number of pricelists

UserApp.PriceList.count = function(callback){
	UserApp.Transport.Current.call(this, 1, 'priceList.count', null, callback);
};

UserApp.PriceList.prototype.count = function(callback){
	UserApp.PriceList.count(arguments, callback);
};

// Remove a specific pricelist

UserApp.PriceList.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'priceList.remove', arguments, callback);
};

UserApp.PriceList.prototype.remove = function(callback){
	UserApp.PriceList.remove(callback);
};

// Plan

UserApp.Plan = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get a plan

UserApp.Plan.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'plan.get', arguments, callback);
};

UserApp.Plan.prototype.get = function(arguments, callback){
	UserApp.Plan.get(arguments, callback);
};

// Search for plans

UserApp.Plan.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'plan.search', arguments, callback);
};

UserApp.Plan.prototype.search = function(arguments, callback){
	UserApp.Plan.search(arguments, callback);
};

// Save a plan

UserApp.Plan.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'plan.save', arguments, callback);
};

UserApp.Plan.prototype.save = function(arguments, callback){
	UserApp.Plan.save(arguments, callback);
};

// Count number of pricelistplans

UserApp.Plan.count = function(callback){
	UserApp.Transport.Current.call(this, 1, 'plan.count', null, callback);
};

UserApp.Plan.prototype.count = function(callback){
	UserApp.Plan.count(arguments, callback);
};

// Remove a specific pricelistplan

UserApp.Plan.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'plan.remove', arguments, callback);
};

UserApp.Plan.prototype.remove = function(callback){
	UserApp.Plan.remove(callback);
};

// User Invoice

UserApp.User.Invoice = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get invoices

UserApp.User.Invoice.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.invoice.get', arguments, callback);
};

UserApp.User.Invoice.prototype.get = function(callback){
	UserApp.Plan.get(callback);
};

// Search for invoices

UserApp.User.Invoice.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.invoice.search', arguments, callback);
};

UserApp.User.Invoice.prototype.search = function(callback){
	UserApp.Plan.search(callback);
};

// Save a invoice

UserApp.User.Invoice.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.invoice.save', arguments, callback);
};

UserApp.User.Invoice.prototype.save = function(callback){
	UserApp.Plan.save(callback);
};

// Remove invoices

UserApp.User.Invoice.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.invoice.remove', arguments, callback);
};

UserApp.User.Invoice.prototype.remove = function(callback){
	UserApp.Plan.remove(callback);
};

// User Payment Method

UserApp.User.PaymentMethod = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get payment methods

UserApp.User.PaymentMethod.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.paymentMethod.get', arguments, callback);
};

UserApp.User.PaymentMethod.prototype.get = function(callback){
	UserApp.Plan.get(callback);
};

// Search for payment methods

UserApp.User.PaymentMethod.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.paymentMethod.search', arguments, callback);
};

UserApp.User.PaymentMethod.prototype.search = function(callback){
	UserApp.Plan.search(callback);
};

// Save a payment method

UserApp.User.PaymentMethod.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.paymentMethod.save', arguments, callback);
};

UserApp.User.PaymentMethod.prototype.save = function(callback){
	UserApp.Plan.save(callback);
};

// Remove payment methods

UserApp.User.PaymentMethod.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'user.paymentMethod.remove', arguments, callback);
};

UserApp.User.PaymentMethod.prototype.remove = function(callback){
	UserApp.Plan.remove(callback);
};

// Export

UserApp.Export = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get payment methods

UserApp.Export.stream = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'export.stream', arguments, callback, true);
};

UserApp.Export.prototype.stream = function(callback){
	UserApp.Export.stream(callback);
};


// OAuth

UserApp.OAuth = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Consume an oauth callback token

UserApp.OAuth.getAuthorizationUrl = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.getAuthorizationUrl', arguments, callback);
};

UserApp.OAuth.prototype.getAuthorizationUrl = function(callback){
	UserApp.OAuth.getAuthorizationUrl(callback);
};

// Consume an oauth callback token

UserApp.OAuth.consume = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.consume', arguments, callback);
};

UserApp.OAuth.prototype.consume = function(callback){
	UserApp.OAuth.consume(callback);
};

// Request an oauth resource

UserApp.OAuth.request = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.request', arguments, callback);
};

UserApp.OAuth.prototype.request = function(callback){
	UserApp.OAuth.request(callback);
};

// OAuth Connection

UserApp.OAuth.Connection = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Find OAuth connections

UserApp.OAuth.Connection.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.connection.search', arguments, callback);
};

UserApp.OAuth.Connection.prototype.search = function(callback){
	UserApp.OAuth.Connection.search(callback);
};

// Get OAuth connections

UserApp.OAuth.Connection.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.connection.get', arguments, callback);
};

UserApp.OAuth.Connection.prototype.get = function(callback){
	UserApp.OAuth.Connection.get(callback);
};

// Remove OAuth connections

UserApp.OAuth.Connection.remove = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.connection.remove', arguments, callback);
};

UserApp.OAuth.Connection.prototype.remove = function(callback){
	UserApp.OAuth.Connection.remove(callback);
};

// OAuth Provider

UserApp.OAuth.Provider = function(appId, token){
	this.appId = appId == undefined || appId == null ? UserApp.global.appId : appId;
	this.token = token == undefined || token == null ? UserApp.global.token : token;
};

// Get

UserApp.OAuth.Provider.get = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.provider.get', arguments, callback);
};

UserApp.OAuth.Provider.prototype.get = function(callback){
	UserApp.OAuth.Provider.get(callback);
};

// Search

UserApp.OAuth.Provider.search = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.provider.search', arguments, callback);
};

UserApp.OAuth.Provider.prototype.search = function(callback){
	UserApp.OAuth.Provider.search(callback);
};

// Save

UserApp.OAuth.Provider.save = function(arguments, callback){
	UserApp.Transport.Current.call(this, 1, 'oauth.provider.save', arguments, callback);
};

UserApp.OAuth.Provider.prototype.save = function(callback){
	UserApp.OAuth.Provider.save(callback);
};