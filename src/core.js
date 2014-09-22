/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/

/* jslint esnext: true */

import {defineProperty, objCreate} from './es5';
import IntlMessageFormat from 'intl-messageformat';
import diff from './diff';

export default RelativeFormat;

var PRIORITY = ['second', 'minute', 'hour', 'day', 'month', 'year'];

// -- RelativeFormat --------------------------------------------------------

function RelativeFormat(locales, options) {
    options = options || {};

    defineProperty(this, '_locale', {value: this._resolveLocale(locales)});
    defineProperty(this, '_messages', {value: objCreate(null)});

    if (options.units && this._isValidUnits(options.units)) {
        defineProperty(this, '_units', {value: options.units});
    }

    // "Bind" `format()` method to `this` so it can be passed by reference like
    // the other `Intl` APIs.
    var relativeFormat = this;
    this.format = function format(date) {
        return relativeFormat._format(date);
    };
}

// Define internal private properties for dealing with locale data.
defineProperty(RelativeFormat, '__availableLocales__', {value: []});
defineProperty(RelativeFormat, '__localeData__', {value: objCreate(null)});
defineProperty(RelativeFormat, '__addLocaleData', {value: function (data) {
    if (!(data && data.locale)) {
        throw new Error(
            'Locale data provided to IntlRelativeFormat does not contain a ' +
            '`locale` property'
        );
    }

    if (!data.fields) {
        throw new Error(
            'Locale data provided to IntlRelativeFormat does not contain a ' +
            '`fields` property'
        );
    }

    // Add data to IntlMessageFormat.
    IntlMessageFormat.__addLocaleData(data);

    var availableLocales = RelativeFormat.__availableLocales__,
        localeData       = RelativeFormat.__localeData__;

    // Message format locale data only requires the first part of the tag.
    var locale = data.locale.toLowerCase().split('-')[0];

    availableLocales.push(locale);
    localeData[locale] = data;
}});

// Define public `defaultLocale` property which can be set by the developer, or
// it will be set when the first RelativeFormat instance is created by leveraging
// the resolved locale from `Intl`.
defineProperty(RelativeFormat, 'defaultLocale', {
    enumerable: true,
    writable  : true,
    value     : undefined
});

// Define public `thresholds` property which can be set by the developer, and
// defaults to relative time thresholds from moment.js.
defineProperty(RelativeFormat, 'thresholds', {
    enumerable: true,

    value: {
        second: 45,  // seconds to minute
        minute: 45,  // minutes to hour
        hour  : 22,  // hours to day
        day   : 26,  // days to month
        month : 11   // months to year
    }
});

RelativeFormat.prototype.resolvedOptions = function () {
    return {
        locale: this._locale,
        units : this._units
    };
};

RelativeFormat.prototype._format = function (date) {
    date = new Date(date);

    // Determine if the `date` is valid.
    if (!(date && date.getTime())) {
        throw new TypeError(
            'A Date must be provided to a IntlRelativeFormat instance\'s ' +
            '`format()` function'
        );
    }

    var diffReport  = diff(new Date(), date);
    var units       = this._units || this._selectUnits(diffReport);
    var diffInUnits = diffReport[units];

    var relativeUnits = this._resolveRelativeUnits(diffInUnits, units);
    if (relativeUnits) {
        return relativeUnits;
    }

    var msg = this._resolveMessage(units);
    return msg.format({
        '0' : Math.abs(diffInUnits),
        when: diffInUnits < 0 ? 'past' : 'future'
    });
};

RelativeFormat.prototype._isValidUnits = function (units) {
    if (PRIORITY.indexOf(units) >= 0) {
        return true;
    }

    var suggestion = /s$/.test(units) && units.substring(0, units.length - 1);
    if (suggestion && PRIORITY.indexOf(suggestion) >= 0) {
        throw new Error(
            '"' + units + '" is not a valid IntlRelativeFormat `units` ' +
            'value, did you mean: ' + suggestion
        );
    } else {
        throw new Error(
            '"' + units + '" is not a valid IntlRelativeFormat `units` ' +
            'value, it must be one of: ' + PRIORITY.join(', ')
        );
    }
};

RelativeFormat.prototype._resolveLocale = function (locales) {
    if (!locales) {
        locales = RelativeFormat.defaultLocale;
    }

    if (typeof locales === 'string') {
        locales = [locales];
    }

    var availableLocales = RelativeFormat.__availableLocales__;
    var i, len, locale;

    for (i = 0, len = locales.length; i < len; i += 1) {
        // We just need the root part of the langage tag.
        locale = locales[i].split('-')[0].toLowerCase();

        // Validate that the langage tag is structurally valid.
        if (!/[a-z]{2,3}/.test(locale)) {
            throw new Error(
                'Language tag provided to IntlRelativeFormat is not ' +
                'structrually valid: ' + locale
            );
        }

        // Return the first locale for which we have CLDR data registered.
        if (availableLocales.indexOf(locale) >= 0) {
            return locale;
        }
    }

    throw new Error(
        'No locale data has been added to IntlRelativeFormat for: ' +
        locales.join(', ')
    );
};

RelativeFormat.prototype._resolveMessage = function (units) {
    var messages = this._messages;
    var field, relativeTime, i, future, past, message;

    // Create a new synthetic message based on the locale data from CLDR.
    if (!messages[units]) {
        field        = RelativeFormat.__localeData__[this._locale].fields[units];
        relativeTime = field.relativeTime;
        future       = '';
        past         = '';

        for (i in relativeTime.future) {
            if (relativeTime.future.hasOwnProperty(i)) {
                future += ' ' + i + ' {' +
                    relativeTime.future[i].replace('{0}', '#') + '}';
            }
        }

        for (i in relativeTime.past) {
            if (relativeTime.past.hasOwnProperty(i)) {
                past += ' ' + i + ' {' +
                    relativeTime.past[i].replace('{0}', '#') + '}';
            }
        }

        message = '{when, select, future {{0, plural, ' + future + '}}' +
                'past {{0, plural, ' + past + '}}}';

        messages[units] = new IntlMessageFormat(message, this._locale);
    }

    return messages[units];
};

RelativeFormat.prototype._resolveRelativeUnits = function (diff, units) {
    var field = RelativeFormat.__localeData__[this._locale].fields[units];

    if (field.relative) {
        return field.relative[diff];
    }
};

RelativeFormat.prototype._selectUnits = function (diffReport) {
    var i, l, units;

    for (i = 0, l = PRIORITY.length; i < l; i += 1) {
        units = PRIORITY[i];

        if (Math.abs(diffReport[units]) < RelativeFormat.thresholds[units]) {
            break;
        }
    }

    return units;
};
