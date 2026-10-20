(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
window.EXIF = require('exifreader');
window.base64 = require('base64-js');

},{"base64-js":10,"exifreader":11}],2:[function(require,module,exports){
'use strict';

/**
 * Ponyfill for `Array.prototype.find` which is only available in ES6 runtimes.
 *
 * Works with anything that has a `length` property and index access properties,
 * including NodeList.
 *
 * @param {T[] | { length: number; [number]: T }} list
 * @param {function (item: T, index: number, list:T[]):boolean} predicate
 * @param {Partial<Pick<ArrayConstructor['prototype'], 'find'>>?} ac
 * Allows injecting a custom implementation in tests (`Array.prototype` by default).
 * @returns {T | undefined}
 * @template {unknown} T
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
 * @see https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.find
 */
function find(list, predicate, ac) {
	if (ac === undefined) {
		ac = Array.prototype;
	}
	if (list && typeof ac.find === 'function') {
		return ac.find.call(list, predicate);
	}
	for (var i = 0; i < list.length; i++) {
		if (hasOwn(list, i)) {
			var item = list[i];
			if (predicate.call(undefined, item, i, list)) {
				return item;
			}
		}
	}
}

/**
 * "Shallow freezes" an object to render it immutable.
 * Uses `Object.freeze` if available,
 * otherwise the immutability is only in the type.
 *
 * Is used to create "enum like" objects.
 *
 * If `Object.getOwnPropertyDescriptors` is available,
 * a new object with all properties of object but without any prototype is created and returned
 * after freezing it.
 *
 * @param {T} object
 * The object to freeze.
 * @param {Pick<ObjectConstructor, 'create' | 'freeze' | 'getOwnPropertyDescriptors'>} [oc=Object]
 * `Object` by default,
 * allows to inject custom object constructor for tests.
 * @returns {Readonly<T>}
 * @template {Object} T
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
 * @prettierignore
 */
function freeze(object, oc) {
	if (oc === undefined) {
		oc = Object;
	}
	if (oc && typeof oc.getOwnPropertyDescriptors === 'function') {
		object = oc.create(null, oc.getOwnPropertyDescriptors(object));
	}
	return oc && typeof oc.freeze === 'function' ? oc.freeze(object) : object;
}

/**
 * Implementation for `Object.hasOwn` but ES5 compatible.
 *
 * @param {any} object
 * @param {string | number} key
 * @returns {boolean}
 */
function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Since xmldom can not rely on `Object.assign`,
 * it uses/provides a simplified version that is sufficient for its needs.
 *
 * @param {Object} target
 * @param {Object | null | undefined} source
 * @returns {Object}
 * The target with the merged/overridden properties.
 * @throws {TypeError}
 * If target is not an object.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
 * @see https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.assign
 */
function assign(target, source) {
	if (target === null || typeof target !== 'object') {
		throw new TypeError('target is not an object');
	}
	for (var key in source) {
		if (hasOwn(source, key)) {
			target[key] = source[key];
		}
	}
	return target;
}

/**
 * A number of attributes are boolean attributes.
 * The presence of a boolean attribute on an element represents the `true` value,
 * and the absence of the attribute represents the `false` value.
 *
 * If the attribute is present, its value must either be the empty string, or a value that is
 * an ASCII case-insensitive match for the attribute's canonical name,
 * with no leading or trailing whitespace.
 *
 * Note: The values `"true"` and `"false"` are not allowed on boolean attributes.
 * To represent a `false` value, the attribute has to be omitted altogether.
 *
 * @see https://html.spec.whatwg.org/#boolean-attributes
 * @see https://html.spec.whatwg.org/#attributes-3
 */
var HTML_BOOLEAN_ATTRIBUTES = freeze({
	allowfullscreen: true,
	async: true,
	autofocus: true,
	autoplay: true,
	checked: true,
	controls: true,
	default: true,
	defer: true,
	disabled: true,
	formnovalidate: true,
	hidden: true,
	ismap: true,
	itemscope: true,
	loop: true,
	multiple: true,
	muted: true,
	nomodule: true,
	novalidate: true,
	open: true,
	playsinline: true,
	readonly: true,
	required: true,
	reversed: true,
	selected: true,
});

/**
 * Check if `name` is matching one of the HTML boolean attribute names.
 * This method doesn't check if such attributes are allowed in the context of the current
 * document/parsing.
 *
 * @param {string} name
 * @returns {boolean}
 * @see {@link HTML_BOOLEAN_ATTRIBUTES}
 * @see https://html.spec.whatwg.org/#boolean-attributes
 * @see https://html.spec.whatwg.org/#attributes-3
 */
function isHTMLBooleanAttribute(name) {
	return hasOwn(HTML_BOOLEAN_ATTRIBUTES, name.toLowerCase());
}

/**
 * Void elements only have a start tag; end tags must not be specified for void elements.
 * These elements should be written as self-closing like this: `<area />`.
 * This should not be confused with optional tags that HTML allows to omit the end tag for
 * (like `li`, `tr` and others), which can have content after them,
 * so they can not be written as self-closing.
 * xmldom does not have any logic for optional end tags cases,
 * and will report them as a warning.
 * Content that would go into the unopened element,
 * will instead be added as a sibling text node.
 *
 * @type {Readonly<{
 * 	area: boolean;
 * 	col: boolean;
 * 	img: boolean;
 * 	wbr: boolean;
 * 	link: boolean;
 * 	hr: boolean;
 * 	source: boolean;
 * 	br: boolean;
 * 	input: boolean;
 * 	param: boolean;
 * 	meta: boolean;
 * 	embed: boolean;
 * 	track: boolean;
 * 	base: boolean;
 * }>}
 * @see https://html.spec.whatwg.org/#void-elements
 * @see https://html.spec.whatwg.org/#optional-tags
 */
var HTML_VOID_ELEMENTS = freeze({
	area: true,
	base: true,
	br: true,
	col: true,
	embed: true,
	hr: true,
	img: true,
	input: true,
	link: true,
	meta: true,
	param: true,
	source: true,
	track: true,
	wbr: true,
});

/**
 * Check if `tagName` is matching one of the HTML void element names.
 * This method doesn't check if such tags are allowed in the context of the current
 * document/parsing.
 *
 * @param {string} tagName
 * @returns {boolean}
 * @see {@link HTML_VOID_ELEMENTS}
 * @see https://html.spec.whatwg.org/#void-elements
 */
function isHTMLVoidElement(tagName) {
	return hasOwn(HTML_VOID_ELEMENTS, tagName.toLowerCase());
}

/**
 * Tag names that are raw text elements according to HTML spec.
 * The value denotes whether they are escapable or not.
 *
 * @see {@link isHTMLEscapableRawTextElement}
 * @see {@link isHTMLRawTextElement}
 * @see https://html.spec.whatwg.org/#raw-text-elements
 * @see https://html.spec.whatwg.org/#escapable-raw-text-elements
 */
var HTML_RAW_TEXT_ELEMENTS = freeze({
	script: false,
	style: false,
	textarea: true,
	title: true,
});

/**
 * Check if `tagName` is matching one of the HTML raw text element names.
 * This method doesn't check if such tags are allowed in the context of the current
 * document/parsing.
 *
 * @param {string} tagName
 * @returns {boolean}
 * @see {@link isHTMLEscapableRawTextElement}
 * @see {@link HTML_RAW_TEXT_ELEMENTS}
 * @see https://html.spec.whatwg.org/#raw-text-elements
 * @see https://html.spec.whatwg.org/#escapable-raw-text-elements
 */
function isHTMLRawTextElement(tagName) {
	var key = tagName.toLowerCase();
	return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && !HTML_RAW_TEXT_ELEMENTS[key];
}
/**
 * Check if `tagName` is matching one of the HTML escapable raw text element names.
 * This method doesn't check if such tags are allowed in the context of the current
 * document/parsing.
 *
 * @param {string} tagName
 * @returns {boolean}
 * @see {@link isHTMLRawTextElement}
 * @see {@link HTML_RAW_TEXT_ELEMENTS}
 * @see https://html.spec.whatwg.org/#raw-text-elements
 * @see https://html.spec.whatwg.org/#escapable-raw-text-elements
 */
function isHTMLEscapableRawTextElement(tagName) {
	var key = tagName.toLowerCase();
	return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && HTML_RAW_TEXT_ELEMENTS[key];
}
/**
 * Only returns true if `value` matches MIME_TYPE.HTML, which indicates an HTML document.
 *
 * @param {string} mimeType
 * @returns {mimeType is 'text/html'}
 * @see https://www.iana.org/assignments/media-types/text/html
 * @see https://en.wikipedia.org/wiki/HTML
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
 */
function isHTMLMimeType(mimeType) {
	return mimeType === MIME_TYPE.HTML;
}
/**
 * For both the `text/html` and the `application/xhtml+xml` namespace the spec defines that the
 * HTML namespace is provided as the default.
 *
 * @param {string} mimeType
 * @returns {boolean}
 * @see https://dom.spec.whatwg.org/#dom-document-createelement
 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument
 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
 */
function hasDefaultHTMLNamespace(mimeType) {
	return isHTMLMimeType(mimeType) || mimeType === MIME_TYPE.XML_XHTML_APPLICATION;
}

/**
 * All mime types that are allowed as input to `DOMParser.parseFromString`
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString#Argument02
 *      MDN
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparsersupportedtype
 *      WHATWG HTML Spec
 * @see {@link DOMParser.prototype.parseFromString}
 */
var MIME_TYPE = freeze({
	/**
	 * `text/html`, the only mime type that triggers treating an XML document as HTML.
	 *
	 * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
	 * @see https://en.wikipedia.org/wiki/HTML Wikipedia
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
	 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
	 *      WHATWG HTML Spec
	 */
	HTML: 'text/html',

	/**
	 * `application/xml`, the standard mime type for XML documents.
	 *
	 * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType
	 *      registration
	 * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
	 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
	 */
	XML_APPLICATION: 'application/xml',

	/**
	 * `text/xml`, an alias for `application/xml`.
	 *
	 * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
	 * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
	 * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
	 */
	XML_TEXT: 'text/xml',

	/**
	 * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
	 * but is parsed as an XML document.
	 *
	 * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType
	 *      registration
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
	 * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
	 */
	XML_XHTML_APPLICATION: 'application/xhtml+xml',

	/**
	 * `image/svg+xml`,
	 *
	 * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
	 * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
	 * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
	 */
	XML_SVG_IMAGE: 'image/svg+xml',
});
/**
 * @typedef {'application/xhtml+xml' | 'application/xml' | 'image/svg+xml' | 'text/html' | 'text/xml'}
 * MimeType
 */
/**
 * @type {MimeType[]}
 * @private
 * Basically `Object.values`, which is not available in ES5.
 */
var _MIME_TYPES = Object.keys(MIME_TYPE).map(function (key) {
	return MIME_TYPE[key];
});

/**
 * Only returns true if `mimeType` is one of the allowed values for
 * `DOMParser.parseFromString`.
 *
 * @param {string} mimeType
 * @returns {mimeType is 'application/xhtml+xml' | 'application/xml' | 'image/svg+xml' |  'text/html' | 'text/xml'}
 *
 */
function isValidMimeType(mimeType) {
	return _MIME_TYPES.indexOf(mimeType) > -1;
}
/**
 * Namespaces that are used in this code base.
 *
 * @see http://www.w3.org/TR/REC-xml-names
 */
var NAMESPACE = freeze({
	/**
	 * The XHTML namespace.
	 *
	 * @see http://www.w3.org/1999/xhtml
	 */
	HTML: 'http://www.w3.org/1999/xhtml',

	/**
	 * The SVG namespace.
	 *
	 * @see http://www.w3.org/2000/svg
	 */
	SVG: 'http://www.w3.org/2000/svg',

	/**
	 * The `xml:` namespace.
	 *
	 * @see http://www.w3.org/XML/1998/namespace
	 */
	XML: 'http://www.w3.org/XML/1998/namespace',

	/**
	 * The `xmlns:` namespace.
	 *
	 * @see https://www.w3.org/2000/xmlns/
	 */
	XMLNS: 'http://www.w3.org/2000/xmlns/',
});

exports.assign = assign;
exports.find = find;
exports.freeze = freeze;
exports.HTML_BOOLEAN_ATTRIBUTES = HTML_BOOLEAN_ATTRIBUTES;
exports.HTML_RAW_TEXT_ELEMENTS = HTML_RAW_TEXT_ELEMENTS;
exports.HTML_VOID_ELEMENTS = HTML_VOID_ELEMENTS;
exports.hasDefaultHTMLNamespace = hasDefaultHTMLNamespace;
exports.hasOwn = hasOwn;
exports.isHTMLBooleanAttribute = isHTMLBooleanAttribute;
exports.isHTMLRawTextElement = isHTMLRawTextElement;
exports.isHTMLEscapableRawTextElement = isHTMLEscapableRawTextElement;
exports.isHTMLMimeType = isHTMLMimeType;
exports.isHTMLVoidElement = isHTMLVoidElement;
exports.isValidMimeType = isValidMimeType;
exports.MIME_TYPE = MIME_TYPE;
exports.NAMESPACE = NAMESPACE;

},{}],3:[function(require,module,exports){
'use strict';

var conventions = require('./conventions');
var dom = require('./dom');
var errors = require('./errors');
var entities = require('./entities');
var sax = require('./sax');

var DOMImplementation = dom.DOMImplementation;

var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
var isHTMLMimeType = conventions.isHTMLMimeType;
var isValidMimeType = conventions.isValidMimeType;
var MIME_TYPE = conventions.MIME_TYPE;
var NAMESPACE = conventions.NAMESPACE;
var ParseError = errors.ParseError;

var XMLReader = sax.XMLReader;

/**
 * Normalizes line ending according to <https://www.w3.org/TR/xml11/#sec-line-ends>,
 * including some Unicode "newline" characters:
 *
 * > XML parsed entities are often stored in computer files which,
 * > for editing convenience, are organized into lines.
 * > These lines are typically separated by some combination
 * > of the characters CARRIAGE RETURN (#xD) and LINE FEED (#xA).
 * >
 * > To simplify the tasks of applications, the XML processor must behave
 * > as if it normalized all line breaks in external parsed entities (including the document entity)
 * > on input, before parsing, by translating the following to a single #xA character:
 * >
 * > 1. the two-character sequence #xD #xA,
 * > 2. the two-character sequence #xD #x85,
 * > 3. the single character #x85,
 * > 4. the single character #x2028,
 * > 5. the single character #x2029,
 * > 6. any #xD character that is not immediately followed by #xA or #x85.
 *
 * @param {string} input
 * @returns {string}
 * @prettierignore
 */
function normalizeLineEndings(input) {
	return input.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028\u2029]/g, '\n');
}

/**
 * @typedef Locator
 * @property {number} [columnNumber]
 * @property {number} [lineNumber]
 */

/**
 * @typedef DOMParserOptions
 * @property {typeof assign} [assign]
 * The method to use instead of `conventions.assign`, which is used to copy values from
 * `options` before they are used for parsing.
 * @property {typeof DOMHandler} [domHandler]
 * For internal testing: The class for creating an instance for handling events from the SAX
 * parser.
 * *****Warning: By configuring a faulty implementation, the specified behavior can completely
 * be broken.*****.
 * @property {Function} [errorHandler]
 * DEPRECATED! use `onError` instead.
 * @property {function(level:ErrorLevel, message:string, context: DOMHandler):void}
 * [onError]
 * A function invoked for every error that occurs during parsing.
 *
 * If it is not provided, all errors are reported to `console.error`
 * and only `fatalError`s are thrown as a `ParseError`,
 * which prevents any further processing.
 * If the provided method throws, a `ParserError` is thrown,
 * which prevents any further processing.
 *
 * Be aware that many `warning`s are considered an error that prevents further processing in
 * most implementations.
 * @property {boolean} [locator=true]
 * Configures if the nodes created during parsing will have a `lineNumber` and a `columnNumber`
 * attribute describing their location in the XML string.
 * Default is true.
 * @property {(string) => string} [normalizeLineEndings]
 * used to replace line endings before parsing, defaults to exported `normalizeLineEndings`,
 * which normalizes line endings according to <https://www.w3.org/TR/xml11/#sec-line-ends>,
 * including some Unicode "newline" characters.
 * @property {Object} [xmlns]
 * The XML namespaces that should be assumed when parsing.
 * The default namespace can be provided by the key that is the empty string.
 * When the `mimeType` for HTML, XHTML or SVG are passed to `parseFromString`,
 * the default namespace that will be used,
 * will be overridden according to the specification.
 * @see {@link normalizeLineEndings}
 */

/**
 * The DOMParser interface provides the ability to parse XML or HTML source code from a string
 * into a DOM `Document`.
 *
 * ***xmldom is different from the spec in that it allows an `options` parameter,
 * to control the behavior***.
 *
 * @class
 * @param {DOMParserOptions} [options]
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-parsing-and-serialization
 */
function DOMParser(options) {
	options = options || {};
	if (options.locator === undefined) {
		options.locator = true;
	}

	/**
	 * The method to use instead of `conventions.assign`, which is used to copy values from
	 * `options`
	 * before they are used for parsing.
	 *
	 * @type {conventions.assign}
	 * @private
	 * @see {@link conventions.assign}
	 * @readonly
	 */
	this.assign = options.assign || conventions.assign;

	/**
	 * For internal testing: The class for creating an instance for handling events from the SAX
	 * parser.
	 * *****Warning: By configuring a faulty implementation, the specified behavior can completely
	 * be broken*****.
	 *
	 * @type {typeof DOMHandler}
	 * @private
	 * @readonly
	 */
	this.domHandler = options.domHandler || DOMHandler;

	/**
	 * A function that is invoked for every error that occurs during parsing.
	 *
	 * If it is not provided, all errors are reported to `console.error`
	 * and only `fatalError`s are thrown as a `ParseError`,
	 * which prevents any further processing.
	 * If the provided method throws, a `ParserError` is thrown,
	 * which prevents any further processing.
	 *
	 * Be aware that many `warning`s are considered an error that prevents further processing in
	 * most implementations.
	 *
	 * @type {function(level:ErrorLevel, message:string, context: DOMHandler):void}
	 * @see {@link onErrorStopParsing}
	 * @see {@link onWarningStopParsing}
	 */
	this.onError = options.onError || options.errorHandler;
	if (options.errorHandler && typeof options.errorHandler !== 'function') {
		throw new TypeError('errorHandler object is no longer supported, switch to onError!');
	} else if (options.errorHandler) {
		options.errorHandler('warning', 'The `errorHandler` option has been deprecated, use `onError` instead!', this);
	}

	/**
	 * used to replace line endings before parsing, defaults to `normalizeLineEndings`
	 *
	 * @type {(string) => string}
	 * @readonly
	 */
	this.normalizeLineEndings = options.normalizeLineEndings || normalizeLineEndings;

	/**
	 * Configures if the nodes created during parsing will have a `lineNumber` and a
	 * `columnNumber`
	 * attribute describing their location in the XML string.
	 * Default is true.
	 *
	 * @type {boolean}
	 * @readonly
	 */
	this.locator = !!options.locator;

	/**
	 * The default namespace can be provided by the key that is the empty string.
	 * When the `mimeType` for HTML, XHTML or SVG are passed to `parseFromString`,
	 * the default namespace that will be used,
	 * will be overridden according to the specification.
	 *
	 * @type {Readonly<Object>}
	 * @readonly
	 */
	this.xmlns = this.assign(Object.create(null), options.xmlns);
}

/**
 * Parses `source` using the options in the way configured by the `DOMParserOptions` of `this`
 * `DOMParser`. If `mimeType` is `text/html` an HTML `Document` is created,
 * otherwise an XML `Document` is created.
 *
 * __It behaves different from the description in the living standard__:
 * - Uses the `options` passed to the `DOMParser` constructor to modify the behavior.
 * - Any unexpected input is reported to `onError` with either a `warning`,
 * `error` or `fatalError` level.
 * - Any `fatalError` throws a `ParseError` which prevents further processing.
 * - Any error thrown by `onError` is converted to a `ParseError` which prevents further
 * processing - If no `Document` was created during parsing it is reported as a `fatalError`.
 * - A `DOMException` raised while building the DOM (e.g. an unbound namespace prefix) is
 * reported as a `fatalError` and rethrown as a `ParseError` with the `DOMException` as its
 * `cause`.
 * *****Warning: By configuring a faulty DOMHandler implementation,
 * the specified behavior can completely be broken*****.
 *
 * @param {string} source
 * The XML mime type only allows string input!
 * @param {string} [mimeType='application/xml']
 * the mimeType or contentType of the document to be created determines the `type` of document
 * created (XML or HTML)
 * @returns {Document}
 * The `Document` node.
 * @throws {ParseError}
 * for any `fatalError` or anything that is thrown by `onError`
 * @throws {TypeError}
 * for any invalid `mimeType`
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString
 * @see https://html.spec.whatwg.org/#dom-domparser-parsefromstring-dev
 */
DOMParser.prototype.parseFromString = function (source, mimeType) {
	if (!isValidMimeType(mimeType)) {
		throw new TypeError('DOMParser.parseFromString: the provided mimeType "' + mimeType + '" is not valid.');
	}
	var defaultNSMap = this.assign(Object.create(null), this.xmlns);
	var entityMap = entities.XML_ENTITIES;
	var defaultNamespace = defaultNSMap[''] || null;
	if (hasDefaultHTMLNamespace(mimeType)) {
		entityMap = entities.HTML_ENTITIES;
		defaultNamespace = NAMESPACE.HTML;
	} else if (mimeType === MIME_TYPE.XML_SVG_IMAGE) {
		defaultNamespace = NAMESPACE.SVG;
	}
	defaultNSMap[''] = defaultNamespace;
	defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;

	var domBuilder = new this.domHandler({
		mimeType: mimeType,
		defaultNamespace: defaultNamespace,
		onError: this.onError,
	});
	var locator = this.locator ? {} : undefined;
	if (this.locator) {
		domBuilder.setDocumentLocator(locator);
	}

	var sax = new XMLReader();
	sax.errorHandler = domBuilder;
	sax.domBuilder = domBuilder;
	var isXml = !conventions.isHTMLMimeType(mimeType);
	if (isXml && typeof source !== 'string') {
		sax.errorHandler.fatalError('source is not a string');
	}
	sax.parse(this.normalizeLineEndings(String(source)), defaultNSMap, entityMap);
	if (!domBuilder.doc.documentElement) {
		sax.errorHandler.fatalError('missing root element');
	}
	return domBuilder.doc;
};

/**
 * @typedef DOMHandlerOptions
 * @property {string} [mimeType=MIME_TYPE.XML_APPLICATION]
 * @property {string | null} [defaultNamespace=null]
 */
/**
 * The class that is used to handle events from the SAX parser to create the related DOM
 * elements.
 *
 * Some methods are only implemented as an empty function,
 * since they are (at least currently) not relevant for xmldom.
 *
 * @class
 * @param {DOMHandlerOptions} [options]
 * @see http://www.saxproject.org/apidoc/org/xml/sax/ext/DefaultHandler2.html
 */
function DOMHandler(options) {
	var opt = options || {};
	/**
	 * The mime type is used to determine if the DOM handler will create an XML or HTML document.
	 * Only if it is set to `text/html` it will create an HTML document.
	 * It defaults to MIME_TYPE.XML_APPLICATION.
	 *
	 * @type {string}
	 * @see {@link MIME_TYPE}
	 * @readonly
	 */
	this.mimeType = opt.mimeType || MIME_TYPE.XML_APPLICATION;

	/**
	 * The namespace to use to create an XML document.
	 * For the following reasons this is required:
	 * - The SAX API for `startDocument` doesn't offer any way to pass a namespace,
	 * since at that point there is no way for the parser to know what the default namespace from
	 * the document will be.
	 * - When creating using `DOMImplementation.createDocument` it is required to pass a
	 * namespace,
	 * to determine the correct `Document.contentType`, which should match `this.mimeType`.
	 * - When parsing an XML document with the `application/xhtml+xml` mimeType,
	 * the HTML namespace needs to be the default namespace.
	 *
	 * @type {string | null}
	 * @private
	 * @readonly
	 */
	this.defaultNamespace = opt.defaultNamespace || null;

	/**
	 * @type {boolean}
	 * @private
	 */
	this.cdata = false;

	/**
	 * The last `Element` that was created by `startElement`.
	 * `endElement` sets it to the `currentElement.parentNode`.
	 *
	 * Note: The sax parser currently sets it to white space text nodes between tags.
	 *
	 * @type {Element | Node | undefined}
	 * @private
	 */
	this.currentElement = undefined;

	/**
	 * The Document that is created as part of `startDocument`,
	 * and returned by `DOMParser.parseFromString`.
	 *
	 * @type {Document | undefined}
	 * @readonly
	 */
	this.doc = undefined;

	/**
	 * The locator is stored as part of setDocumentLocator.
	 * It is controlled and mutated by the SAX parser to store the current parsing position.
	 * It is used by DOMHandler to set `columnNumber` and `lineNumber`
	 * on the DOM nodes.
	 *
	 * @type {Readonly<Locator> | undefined}
	 * @private
	 * @readonly (the
	 * sax parser currently sometimes set's it)
	 */
	this.locator = undefined;
	/**
	 * @type {function (level:ErrorLevel ,message:string, context:DOMHandler):void}
	 * @readonly
	 */
	this.onError = opt.onError;
}

function position(locator, node) {
	node.lineNumber = locator.lineNumber;
	node.columnNumber = locator.columnNumber;
}

DOMHandler.prototype = {
	/**
	 * Either creates an XML or an HTML document and stores it under `this.doc`.
	 * If it is an XML document, `this.defaultNamespace` is used to create it,
	 * and it will not contain any `childNodes`.
	 * If it is an HTML document, it will be created without any `childNodes`.
	 *
	 * @see http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
	 */
	startDocument: function () {
		var impl = new DOMImplementation();
		this.doc = isHTMLMimeType(this.mimeType) ? impl.createHTMLDocument(false) : impl.createDocument(this.defaultNamespace, '');
	},
	startElement: function (namespaceURI, localName, qName, attrs) {
		var doc = this.doc;
		var el = doc.createElementNS(namespaceURI, qName || localName);
		var len = attrs.length;
		appendElement(this, el);
		this.currentElement = el;

		this.locator && position(this.locator, el);
		for (var i = 0; i < len; i++) {
			var namespaceURI = attrs.getURI(i);
			var value = attrs.getValue(i);
			var qName = attrs.getQName(i);
			var attr = doc.createAttributeNS(namespaceURI, qName);
			this.locator && position(attrs.getLocator(i), attr);
			attr.value = attr.nodeValue = value;
			el.setAttributeNode(attr);
		}
	},
	endElement: function (namespaceURI, localName, qName) {
		this.currentElement = this.currentElement.parentNode;
	},
	startPrefixMapping: function (prefix, uri) {},
	endPrefixMapping: function (prefix) {},
	processingInstruction: function (target, data) {
		var ins = this.doc.createProcessingInstruction(target, data);
		this.locator && position(this.locator, ins);
		appendElement(this, ins);
	},
	ignorableWhitespace: function (ch, start, length) {},
	characters: function (chars, start, length) {
		chars = _toString.apply(this, arguments);
		//console.log(chars)
		if (chars) {
			if (this.cdata) {
				var charNode = this.doc.createCDATASection(chars);
			} else {
				var charNode = this.doc.createTextNode(chars);
			}
			if (this.currentElement) {
				this.currentElement.appendChild(charNode);
			} else if (/^\s*$/.test(chars)) {
				this.doc.appendChild(charNode);
				//process xml
			}
			this.locator && position(this.locator, charNode);
		}
	},
	skippedEntity: function (name) {},
	endDocument: function () {
		this.doc.normalize();
	},
	/**
	 * Stores the locator to be able to set the `columnNumber` and `lineNumber`
	 * on the created DOM nodes.
	 *
	 * @param {Locator} locator
	 */
	setDocumentLocator: function (locator) {
		if (locator) {
			locator.lineNumber = 0;
		}
		this.locator = locator;
	},
	//LexicalHandler
	comment: function (chars, start, length) {
		chars = _toString.apply(this, arguments);
		var comm = this.doc.createComment(chars);
		this.locator && position(this.locator, comm);
		appendElement(this, comm);
	},

	startCDATA: function () {
		//used in characters() methods
		this.cdata = true;
	},
	endCDATA: function () {
		this.cdata = false;
	},

	startDTD: function (name, publicId, systemId, internalSubset) {
		var impl = this.doc.implementation;
		if (impl && impl.createDocumentType) {
			var dt = impl.createDocumentType(name, publicId, systemId, internalSubset);
			this.locator && position(this.locator, dt);
			appendElement(this, dt);
			this.doc.doctype = dt;
		}
	},
	reportError: function (level, message) {
		if (typeof this.onError === 'function') {
			try {
				this.onError(level, message, this);
			} catch (e) {
				throw new ParseError('Reporting ' + level + ' "' + message + '" caused ' + e, this.locator);
			}
		} else {
			console.error('[xmldom ' + level + ']\t' + message, _locator(this.locator));
		}
	},
	/**
	 * @see http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
	 */
	warning: function (message) {
		this.reportError('warning', message);
	},
	error: function (message) {
		this.reportError('error', message);
	},
	/**
	 * This function reports a fatal error and throws a ParseError.
	 *
	 * @param {string} message
	 * - The message to be used for reporting and throwing the error.
	 * @param {Error} [cause]
	 * The error that caused this fatal error, preserved as the thrown `ParseError`'s `cause`.
	 * @returns {never}
	 * This function always throws an error and never returns a value.
	 * @throws {ParseError}
	 * Always throws a ParseError with the provided message.
	 */
	fatalError: function (message, cause) {
		this.reportError('fatalError', message);
		throw new ParseError(message, this.locator, cause);
	},
};

function _locator(l) {
	if (l) {
		return '\n@#[line:' + l.lineNumber + ',col:' + l.columnNumber + ']';
	}
}

function _toString(chars, start, length) {
	if (typeof chars == 'string') {
		return chars.substr(start, length);
	} else {
		//java sax connect width xmldom on rhino(what about: "? && !(chars instanceof String)")
		if (chars.length >= start + length || start) {
			return new java.lang.String(chars, start, length) + '';
		}
		return chars;
	}
}

/*
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/LexicalHandler.html
 * used method of org.xml.sax.ext.LexicalHandler:
 *  #comment(chars, start, length)
 *  #startCDATA()
 *  #endCDATA()
 *  #startDTD(name, publicId, systemId)
 *
 *
 * IGNORED method of org.xml.sax.ext.LexicalHandler:
 *  #endDTD()
 *  #startEntity(name)
 *  #endEntity(name)
 *
 *
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/DeclHandler.html
 * IGNORED method of org.xml.sax.ext.DeclHandler
 * 	#attributeDecl(eName, aName, type, mode, value)
 *  #elementDecl(name, model)
 *  #externalEntityDecl(name, publicId, systemId)
 *  #internalEntityDecl(name, value)
 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/EntityResolver2.html
 * IGNORED method of org.xml.sax.EntityResolver2
 *  #resolveEntity(String name,String publicId,String baseURI,String systemId)
 *  #resolveEntity(publicId, systemId)
 *  #getExternalSubset(name, baseURI)
 * @link http://www.saxproject.org/apidoc/org/xml/sax/DTDHandler.html
 * IGNORED method of org.xml.sax.DTDHandler
 *  #notationDecl(name, publicId, systemId) {};
 *  #unparsedEntityDecl(name, publicId, systemId, notationName) {};
 */
'endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl'.replace(
	/\w+/g,
	function (key) {
		DOMHandler.prototype[key] = function () {
			return null;
		};
	}
);

/* Private static helpers treated below as private instance methods, so don't need to add these to the public API; we might use a Relator to also get rid of non-standard public properties */
function appendElement(handler, node) {
	if (!handler.currentElement) {
		handler.doc.appendChild(node);
	} else {
		handler.currentElement.appendChild(node);
	}
}

/**
 * A method that prevents any further parsing when an `error`
 * with level `error` is reported during parsing.
 *
 * @see {@link DOMParserOptions.onError}
 * @see {@link onWarningStopParsing}
 */
function onErrorStopParsing(level) {
	if (level === 'error') throw 'onErrorStopParsing';
}

/**
 * A method that prevents any further parsing when any `error` is reported during parsing.
 *
 * @see {@link DOMParserOptions.onError}
 * @see {@link onErrorStopParsing}
 */
function onWarningStopParsing() {
	throw 'onWarningStopParsing';
}

exports.__DOMHandler = DOMHandler;
exports.DOMParser = DOMParser;
exports.normalizeLineEndings = normalizeLineEndings;
exports.onErrorStopParsing = onErrorStopParsing;
exports.onWarningStopParsing = onWarningStopParsing;

},{"./conventions":2,"./dom":4,"./entities":5,"./errors":6,"./sax":9}],4:[function(require,module,exports){
'use strict';

var conventions = require('./conventions');
var find = conventions.find;
var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
var hasOwn = conventions.hasOwn;
var isHTMLMimeType = conventions.isHTMLMimeType;
var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
var isHTMLVoidElement = conventions.isHTMLVoidElement;
var MIME_TYPE = conventions.MIME_TYPE;
var NAMESPACE = conventions.NAMESPACE;

/**
 * Private DOM Constructor symbol
 *
 * Internal symbol used for construction of all classes whose constructors should be private.
 * Currently used for checks in `Node`, `Document`, `Element`, `Attr`, `CharacterData`, `Text`, `Comment`,
 * `CDATASection`, `DocumentType`, `Notation`, `Entity`, `EntityReference`, `DocumentFragment`, `ProcessingInstruction`
 * so the constructor can't be used from outside the module.
 */
var PDC = Symbol();

var errors = require('./errors');
var DOMException = errors.DOMException;
var DOMExceptionName = errors.DOMExceptionName;

var g = require('./grammar');

/**
 * Checks if the given symbol equals the Private DOM Constructor symbol (PDC)
 * and throws an Illegal constructor exception when the symbols don't match.
 * This ensures that the constructor remains private and can't be used outside this module.
 */
function checkSymbol(symbol) {
	if (symbol !== PDC) {
		throw new TypeError('Illegal constructor');
	}
}

/**
 * A prerequisite for `[].filter`, to drop elements that are empty.
 *
 * @param {string} input
 * The string to be checked.
 * @returns {boolean}
 * Returns `true` if the input string is not empty, `false` otherwise.
 */
function notEmptyString(input) {
	return input !== '';
}
/**
 * Splits a string on ASCII whitespace characters (U+0009 TAB, U+000A LF, U+000C FF, U+000D CR,
 * U+0020 SPACE).
 * It follows the definition from the infra specification from WHATWG.
 *
 * @param {string} input
 * The string to be split.
 * @returns {string[]}
 * An array of the split strings. The array can be empty if the input string is empty or only
 * contains whitespace characters.
 * @see {@link https://infra.spec.whatwg.org/#split-on-ascii-whitespace}
 * @see {@link https://infra.spec.whatwg.org/#ascii-whitespace}
 */
function splitOnASCIIWhitespace(input) {
	// U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, U+0020 SPACE
	return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : [];
}

/**
 * Adds element as a key to current if it is not already present.
 *
 * @param {Record<string, boolean | undefined>} current
 * The current record object to which the element will be added as a key.
 * The object's keys are string types and values are either boolean or undefined.
 * @param {string} element
 * The string to be added as a key to the current record.
 * @returns {Record<string, boolean | undefined>}
 * The updated record object after the addition of the new element.
 */
function orderedSetReducer(current, element) {
	if (!hasOwn(current, element)) {
		current[element] = true;
	}
	return current;
}

/**
 * Converts a string into an ordered set by splitting the input on ASCII whitespace and
 * ensuring uniqueness of elements.
 * This follows the definition of an ordered set from the infra specification by WHATWG.
 *
 * @param {string} input
 * The input string to be transformed into an ordered set.
 * @returns {string[]}
 * An array of unique strings obtained from the input, preserving the original order.
 * The array can be empty if the input string is empty or only contains whitespace characters.
 * @see {@link https://infra.spec.whatwg.org/#ordered-set}
 */
function toOrderedSet(input) {
	if (!input) return [];
	var list = splitOnASCIIWhitespace(input);
	return Object.keys(list.reduce(orderedSetReducer, {}));
}

/**
 * Uses `list.indexOf` to implement a function that behaves like `Array.prototype.includes`.
 * This function is used in environments where `Array.prototype.includes` may not be available.
 *
 * @param {any[]} list
 * The array in which to search for the element.
 * @returns {function(any): boolean}
 * A function that accepts an element and returns a boolean indicating whether the element is
 * included in the provided list.
 */
function arrayIncludes(list) {
	return function (element) {
		return list && list.indexOf(element) !== -1;
	};
}

/**
 * Validates a qualified name based on the criteria provided in the DOM specification by
 * WHATWG.
 *
 * @param {string} qualifiedName
 * The qualified name to be validated.
 * @throws {DOMException}
 * With code {@link DOMException.INVALID_CHARACTER_ERR} if the qualified name contains an
 * invalid character.
 * @see {@link https://dom.spec.whatwg.org/#validate}
 */
function validateQualifiedName(qualifiedName) {
	if (!g.QName_exact.test(qualifiedName)) {
		throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in qualified name "' + qualifiedName + '"');
	}
}

/**
 * Validates a qualified name and the namespace associated with it,
 * based on the criteria provided in the DOM specification by WHATWG.
 *
 * @param {string | null} namespace
 * The namespace to be validated. It can be a string or null.
 * @param {string} qualifiedName
 * The qualified name to be validated.
 * @returns {[namespace: string | null, prefix: string | null, localName: string]}
 * Returns a tuple with the namespace,
 * prefix and local name of the qualified name.
 * @throws {DOMException}
 * Throws a DOMException if the qualified name or the namespace is not valid.
 * @see {@link https://dom.spec.whatwg.org/#validate-and-extract}
 */
function validateAndExtract(namespace, qualifiedName) {
	validateQualifiedName(qualifiedName);
	namespace = namespace || null;
	/**
	 * @type {string | null}
	 */
	var prefix = null;
	var localName = qualifiedName;
	if (qualifiedName.indexOf(':') >= 0) {
		var splitResult = qualifiedName.split(':');
		prefix = splitResult[0];
		localName = splitResult[1];
	}
	if (prefix !== null && namespace === null) {
		throw new DOMException(DOMException.NAMESPACE_ERR, 'prefix is non-null and namespace is null');
	}
	if (prefix === 'xml' && namespace !== conventions.NAMESPACE.XML) {
		throw new DOMException(DOMException.NAMESPACE_ERR, 'prefix is "xml" and namespace is not the XML namespace');
	}
	if ((prefix === 'xmlns' || qualifiedName === 'xmlns') && namespace !== conventions.NAMESPACE.XMLNS) {
		throw new DOMException(
			DOMException.NAMESPACE_ERR,
			'either qualifiedName or prefix is "xmlns" and namespace is not the XMLNS namespace'
		);
	}
	if (namespace === conventions.NAMESPACE.XMLNS && prefix !== 'xmlns' && qualifiedName !== 'xmlns') {
		throw new DOMException(
			DOMException.NAMESPACE_ERR,
			'namespace is the XMLNS namespace and neither qualifiedName nor prefix is "xmlns"'
		);
	}
	return [namespace, prefix, localName];
}

/**
 * Copies properties from one object to another.
 * It only copies the object's own (not inherited) properties.
 *
 * @param {Object} src
 * The source object from which properties are copied.
 * @param {Object} dest
 * The destination object to which properties are copied.
 */
function copy(src, dest) {
	for (var p in src) {
		if (hasOwn(src, p)) {
			dest[p] = src[p];
		}
	}
}

/**
 * Extends a class with the properties and methods of a super class.
 * It uses a form of prototypal inheritance, and establishes the `constructor` property
 * correctly(?).
 *
 * It is not clear to the current maintainers if this implementation is making sense,
 * since it creates an intermediate prototype function,
 * which all properties of `Super` are copied onto using `_copy`.
 *
 * @param {Object} Class
 * The class that is to be extended.
 * @param {Object} Super
 * The super class from which properties and methods are inherited.
 * @private
 */
function _extends(Class, Super) {
	var pt = Class.prototype;
	if (!(pt instanceof Super)) {
		function t() {}
		t.prototype = Super.prototype;
		t = new t();
		copy(pt, t);
		Class.prototype = pt = t;
	}
	if (pt.constructor != Class) {
		if (typeof Class != 'function') {
			console.error('unknown Class:' + Class);
		}
		pt.constructor = Class;
	}
}

var NodeType = {};
var ELEMENT_NODE = (NodeType.ELEMENT_NODE = 1);
var ATTRIBUTE_NODE = (NodeType.ATTRIBUTE_NODE = 2);
var TEXT_NODE = (NodeType.TEXT_NODE = 3);
var CDATA_SECTION_NODE = (NodeType.CDATA_SECTION_NODE = 4);
var ENTITY_REFERENCE_NODE = (NodeType.ENTITY_REFERENCE_NODE = 5);
var ENTITY_NODE = (NodeType.ENTITY_NODE = 6);
var PROCESSING_INSTRUCTION_NODE = (NodeType.PROCESSING_INSTRUCTION_NODE = 7);
var COMMENT_NODE = (NodeType.COMMENT_NODE = 8);
var DOCUMENT_NODE = (NodeType.DOCUMENT_NODE = 9);
var DOCUMENT_TYPE_NODE = (NodeType.DOCUMENT_TYPE_NODE = 10);
var DOCUMENT_FRAGMENT_NODE = (NodeType.DOCUMENT_FRAGMENT_NODE = 11);
var NOTATION_NODE = (NodeType.NOTATION_NODE = 12);

var DocumentPosition = conventions.freeze({
	DOCUMENT_POSITION_DISCONNECTED: 1,
	DOCUMENT_POSITION_PRECEDING: 2,
	DOCUMENT_POSITION_FOLLOWING: 4,
	DOCUMENT_POSITION_CONTAINS: 8,
	DOCUMENT_POSITION_CONTAINED_BY: 16,
	DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32,
});

//helper functions for compareDocumentPosition
/**
 * Finds the common ancestor in two parent chains.
 *
 * @param {Node[]} a
 * The first parent chain.
 * @param {Node[]} b
 * The second parent chain.
 * @returns {Node}
 * The common ancestor node if it exists. If there is no common ancestor, the function will
 * return `null`.
 */
function commonAncestor(a, b) {
	if (b.length < a.length) return commonAncestor(b, a);
	var c = null;
	for (var n in a) {
		if (a[n] !== b[n]) return c;
		c = a[n];
	}
	return c;
}

/**
 * Assigns a unique identifier to a document to ensure consistency while comparing unrelated
 * nodes.
 *
 * @param {Document} doc
 * The document to which a unique identifier is to be assigned.
 * @returns {string}
 * The unique identifier of the document. If the document already had a unique identifier, the
 * function will return the existing one.
 */
function docGUID(doc) {
	if (!doc.guid) doc.guid = Math.random();
	return doc.guid;
}
//-- end of helper functions

/**
 * The NodeList interface provides the abstraction of an ordered collection of nodes,
 * without defining or constraining how this collection is implemented.
 * NodeList objects in the DOM are live.
 * The items in the NodeList are accessible via an integral index, starting from 0.
 * You can also access the items of the NodeList with a `for...of` loop.
 *
 * @class NodeList
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-536297177
 * @constructs NodeList
 */
function NodeList() {}
NodeList.prototype = {
	/**
	 * The number of nodes in the list. The range of valid child node indices is 0 to length-1
	 * inclusive.
	 *
	 * @type {number}
	 */
	length: 0,
	/**
	 * Returns the item at `index`. If index is greater than or equal to the number of nodes in
	 * the list, this returns null.
	 *
	 * @param index
	 * Unsigned long Index into the collection.
	 * @returns {Node | null}
	 * The node at position `index` in the NodeList,
	 * or null if that is not a valid index.
	 */
	item: function (index) {
		return index >= 0 && index < this.length ? this[index] : null;
	},
	/**
	 * Returns a string representation of the NodeList.
	 *
	 * Accepts the same `options` object as `XMLSerializer.prototype.serializeToString`
	 * (`requireWellFormed`, `splitCDATASections`, `nodeFilter`). Passing a function is treated as
	 * a legacy `nodeFilter` for backward compatibility.
	 *
	 * @param {Object | function} [options]
	 * @param {boolean} [options.requireWellFormed=false]
	 * @param {boolean} [options.splitCDATASections=true]
	 * @param {function} [options.nodeFilter]
	 * @returns {string}
	 */
	toString: function (options) {
		var opts;
		if (typeof options === 'function') {
			opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
		} else if (!!options) {
			opts = {
				requireWellFormed: !!options.requireWellFormed,
				splitCDATASections: options.splitCDATASections !== false,
				nodeFilter: options.nodeFilter || null,
			};
		} else {
			opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
		}
		for (var buf = [], i = 0; i < this.length; i++) {
			serializeToString(this[i], buf, null, opts);
		}
		return buf.join('');
	},
	/**
	 * Filters the NodeList based on a predicate.
	 *
	 * @param {function(Node): boolean} predicate
	 * - A predicate function to filter the NodeList.
	 * @returns {Node[]}
	 * An array of nodes that satisfy the predicate.
	 * @private
	 */
	filter: function (predicate) {
		return Array.prototype.filter.call(this, predicate);
	},
	/**
	 * Returns the first index at which a given node can be found in the NodeList, or -1 if it is
	 * not present.
	 *
	 * @param {Node} item
	 * - The Node item to locate in the NodeList.
	 * @returns {number}
	 * The first index of the node in the NodeList; -1 if not found.
	 * @private
	 */
	indexOf: function (item) {
		return Array.prototype.indexOf.call(this, item);
	},
};
NodeList.prototype[Symbol.iterator] = function () {
	var me = this;
	var index = 0;

	return {
		next: function () {
			if (index < me.length) {
				return {
					value: me[index++],
					done: false,
				};
			} else {
				return {
					done: true,
				};
			}
		},
		return: function () {
			return {
				done: true,
			};
		},
	};
};

/**
 * Represents a live collection of nodes that is automatically updated when its associated
 * document changes.
 *
 * @class LiveNodeList
 * @param {Node} node
 * The associated node.
 * @param {function} refresh
 * The function to refresh the live node list.
 * @augments NodeList
 * @constructs LiveNodeList
 */
function LiveNodeList(node, refresh) {
	this._node = node;
	this._refresh = refresh;
	_updateLiveList(this);
}
/**
 * Updates the live node list.
 *
 * @param {LiveNodeList} list
 * The live node list to update.
 * @private
 */
function _updateLiveList(list) {
	var inc = list._node._inc || list._node.ownerDocument._inc;
	if (list._inc !== inc) {
		var ls = list._refresh(list._node);
		__set__(list, 'length', ls.length);
		if (!list.$$length || ls.length < list.$$length) {
			for (var i = ls.length; i in list; i++) {
				if (hasOwn(list, i)) {
					delete list[i];
				}
			}
		}
		copy(ls, list);
		list._inc = inc;
	}
}
/**
 * Returns the node at position `index` in the LiveNodeList, or null if that is not a valid
 * index.
 *
 * @param {number} i
 * Index into the collection.
 * @returns {Node | null}
 * The node at position `index` in the LiveNodeList, or null if that is not a valid index.
 */
LiveNodeList.prototype.item = function (i) {
	_updateLiveList(this);
	return this[i] || null;
};

_extends(LiveNodeList, NodeList);

/**
 * Objects implementing the NamedNodeMap interface are used to represent collections of nodes
 * that can be accessed by name.
 * Note that NamedNodeMap does not inherit from NodeList;
 * NamedNodeMaps are not maintained in any particular order.
 * Objects contained in an object implementing NamedNodeMap may also be accessed by an ordinal
 * index,
 * but this is simply to allow convenient enumeration of the contents of a NamedNodeMap,
 * and does not imply that the DOM specifies an order to these Nodes.
 * NamedNodeMap objects in the DOM are live.
 * used for attributes or DocumentType entities
 *
 * This implementation only supports property indices, but does not support named properties,
 * as specified in the living standard.
 *
 * @class NamedNodeMap
 * @see https://dom.spec.whatwg.org/#interface-namednodemap
 * @see https://webidl.spec.whatwg.org/#dfn-supported-property-names
 * @constructs NamedNodeMap
 */
/**
 * A live collection of an element's attributes, keyed by name.
 *
 * The numbered entries and `length` are the sole authority for attribute order.
 * A separate two-level null-prototype membership index (`namespaceURI` ->
 * `localName` -> `Attr`, with the null/empty namespace held in its own bucket)
 * lets the parse-time de-duplication in `setNamedItem` resolve an existing
 * attribute in O(1) instead of scanning the list, so building an element with M
 * attributes costs O(M) rather than O(M^2). The index never reorders attributes.
 */
function NamedNodeMap() {
	// namespaceURI (non-empty string) -> (localName -> Attr)
	this._nsIndex = Object.create(null);
	// localName -> Attr, for the null / empty-string namespace
	this._noNsIndex = Object.create(null);
}
/**
 * Returns the index of a node within the list.
 *
 * @param {Array} list
 * The list of nodes.
 * @param {Node} node
 * The node to find.
 * @returns {number}
 * The index of the node within the list, or -1 if not found.
 * @private
 */
function _findNodeIndex(list, node) {
	var i = 0;
	while (i < list.length) {
		if (list[i] === node) {
			return i;
		}
		i++;
	}
}
/**
 * Returns the second-level index bucket (`localName` -> `Attr`) for a namespace,
 * replicating `getNamedItemNS`'s falsy-namespace normalization: `null`,
 * `undefined` and `''` all resolve to the dedicated null-namespace bucket, kept separate from
 * any real URI (so a namespace URI equal to the string `"null"`
 * cannot collide with the null namespace). Both levels are null-prototype objects, so an
 * attribute named `__proto__` or `constructor` is an ordinary key.
 *
 * @param {NamedNodeMap} map
 * @param {string | null | undefined} namespaceURI
 * @param {boolean} create
 * Create the bucket if it does not exist yet.
 * @returns {Object | undefined}
 * @private
 */
function _nnmBucket(map, namespaceURI, create) {
	if (!namespaceURI) {
		return map._noNsIndex;
	}
	var bucket = map._nsIndex[namespaceURI];
	if (!bucket && create) {
		bucket = map._nsIndex[namespaceURI] = Object.create(null);
	}
	return bucket;
}
/**
 * Looks up an attribute by namespace and local name through the membership index.
 *
 * @param {NamedNodeMap} map
 * @param {string | null | undefined} namespaceURI
 * @param {string} localName
 * @returns {Attr | null}
 * The matching attribute, or `null` when absent.
 * @private
 */
function _nnmIndexFind(map, namespaceURI, localName) {
	var bucket = _nnmBucket(map, namespaceURI, false);
	var found = bucket && bucket[localName];
	return found ? found : null;
}
/**
 * Records `attr` in the membership index under its namespace and local name,
 * replacing any previous attribute with the same key.
 *
 * @param {NamedNodeMap} map
 * @param {Attr} attr
 * @private
 */
function _nnmIndexAdd(map, attr) {
	_nnmBucket(map, attr.namespaceURI, true)[attr.localName] = attr;
}
/**
 * Removes `attr` from the membership index.
 *
 * @param {NamedNodeMap} map
 * @param {Attr} attr
 * @private
 */
function _nnmIndexRemove(map, attr) {
	var bucket = _nnmBucket(map, attr.namespaceURI, false);
	if (bucket) {
		delete bucket[attr.localName];
	}
}
/**
 * Adds a new attribute to the list and updates the owner element of the attribute.
 *
 * @param {Element} el
 * The element which will become the owner of the new attribute.
 * @param {NamedNodeMap} list
 * The list to which the new attribute will be added.
 * @param {Attr} newAttr
 * The new attribute to be added.
 * @param {Attr} oldAttr
 * The old attribute to be replaced, or null if no attribute is to be replaced.
 * @returns {void}
 * @private
 */
function _addNamedNode(el, list, newAttr, oldAttr) {
	if (oldAttr) {
		list[_findNodeIndex(list, oldAttr)] = newAttr;
	} else {
		list[list.length] = newAttr;
		list.length++;
	}
	// Keep the membership index in sync with the ordered list. On replacement
	// `oldAttr` shares `newAttr`'s (namespace, localName) key, so this overwrites
	// its entry; on append it adds a new one.
	_nnmIndexAdd(list, newAttr);
	if (el) {
		newAttr.ownerElement = el;
		var doc = el.ownerDocument;
		if (doc) {
			oldAttr && _onRemoveAttribute(doc, el, oldAttr);
			_onAddAttribute(doc, el, newAttr);
		}
	}
}
/**
 * Removes an attribute from the list and updates the owner element of the attribute.
 *
 * @param {Element} el
 * The element which is the current owner of the attribute.
 * @param {NamedNodeMap} list
 * The list from which the attribute will be removed.
 * @param {Attr} attr
 * The attribute to be removed.
 * @returns {void}
 * @private
 */
function _removeNamedNode(el, list, attr) {
	//console.log('remove attr:'+attr)
	var i = _findNodeIndex(list, attr);
	if (i >= 0) {
		var lastIndex = list.length - 1;
		while (i <= lastIndex) {
			list[i] = list[++i];
		}
		list.length = lastIndex;
		_nnmIndexRemove(list, attr);
		if (el) {
			var doc = el.ownerDocument;
			if (doc) {
				_onRemoveAttribute(doc, el, attr);
			}
			attr.ownerElement = null;
		}
	}
}
NamedNodeMap.prototype = {
	length: 0,
	item: NodeList.prototype.item,

	/**
	 * Get an attribute by name. Note: Name is in lower case in case of HTML namespace and
	 * document.
	 *
	 * @param {string} localName
	 * The local name of the attribute.
	 * @returns {Attr | null}
	 * The attribute with the given local name, or null if no such attribute exists.
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
	 */
	getNamedItem: function (localName) {
		if (this._ownerElement && this._ownerElement._isInHTMLDocumentAndNamespace()) {
			localName = localName.toLowerCase();
		}
		var i = 0;
		while (i < this.length) {
			var attr = this[i];
			if (attr.nodeName === localName) {
				return attr;
			}
			i++;
		}
		return null;
	},

	/**
	 * Set an attribute.
	 *
	 * @param {Attr} attr
	 * The attribute to set.
	 * @returns {Attr | null}
	 * The old attribute with the same local name and namespace URI as the new one, or null if no
	 * such attribute exists.
	 * @throws {DOMException}
	 * With code:
	 * - {@link INUSE_ATTRIBUTE_ERR} - If the attribute is already an attribute of another
	 * element.
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
	 */
	setNamedItem: function (attr) {
		var el = attr.ownerElement;
		if (el && el !== this._ownerElement) {
			throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
		}
		// Resolve any existing attribute with the same (namespace, localName)
		// through the O(1) membership index rather than an O(M) scan — this is the
		// parse-dedup hot path (`setAttributeNode` per attribute during parse).
		var oldAttr = _nnmIndexFind(this, attr.namespaceURI, attr.localName);
		if (oldAttr === attr) {
			return attr;
		}
		_addNamedNode(this._ownerElement, this, attr, oldAttr);
		return oldAttr;
	},

	/**
	 * Set an attribute, replacing an existing attribute with the same local name and namespace
	 * URI if one exists.
	 *
	 * @param {Attr} attr
	 * The attribute to set.
	 * @returns {Attr | null}
	 * The old attribute with the same local name and namespace URI as the new one, or null if no
	 * such attribute exists.
	 * @throws {DOMException}
	 * Throws a DOMException with the name "InUseAttributeError" if the attribute is already an
	 * attribute of another element.
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
	 */
	setNamedItemNS: function (attr) {
		return this.setNamedItem(attr);
	},

	/**
	 * Removes an attribute specified by the local name.
	 *
	 * @param {string} localName
	 * The local name of the attribute to be removed.
	 * @returns {Attr}
	 * The attribute node that was removed.
	 * @throws {DOMException}
	 * With code:
	 * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given name is found.
	 * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-name
	 */
	removeNamedItem: function (localName) {
		var attr = this.getNamedItem(localName);
		if (!attr) {
			throw new DOMException(DOMException.NOT_FOUND_ERR, localName);
		}
		_removeNamedNode(this._ownerElement, this, attr);
		return attr;
	},

	/**
	 * Removes an attribute specified by the namespace and local name.
	 *
	 * @param {string | null} namespaceURI
	 * The namespace URI of the attribute to be removed.
	 * @param {string} localName
	 * The local name of the attribute to be removed.
	 * @returns {Attr}
	 * The attribute node that was removed.
	 * @throws {DOMException}
	 * With code:
	 * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given namespace URI and local
	 * name is found.
	 * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditemns
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-namespace
	 */
	removeNamedItemNS: function (namespaceURI, localName) {
		var attr = this.getNamedItemNS(namespaceURI, localName);
		if (!attr) {
			throw new DOMException(DOMException.NOT_FOUND_ERR, namespaceURI ? namespaceURI + ' : ' + localName : localName);
		}
		_removeNamedNode(this._ownerElement, this, attr);
		return attr;
	},

	/**
	 * Get an attribute by namespace and local name.
	 *
	 * @param {string | null} namespaceURI
	 * The namespace URI of the attribute.
	 * @param {string} localName
	 * The local name of the attribute.
	 * @returns {Attr | null}
	 * The attribute with the given namespace URI and local name, or null if no such attribute
	 * exists.
	 * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace
	 */
	getNamedItemNS: function (namespaceURI, localName) {
		if (!namespaceURI) {
			namespaceURI = null;
		}
		var i = 0;
		while (i < this.length) {
			var node = this[i];
			if (node.localName === localName && node.namespaceURI === namespaceURI) {
				return node;
			}
			i++;
		}
		return null;
	},
};
NamedNodeMap.prototype[Symbol.iterator] = function () {
	var me = this;
	var index = 0;

	return {
		next: function () {
			if (index < me.length) {
				return {
					value: me[index++],
					done: false,
				};
			} else {
				return {
					done: true,
				};
			}
		},
		return: function () {
			return {
				done: true,
			};
		},
	};
};

/**
 * The DOMImplementation interface provides a number of methods for performing operations that
 * are independent of any particular instance of the document object model.
 *
 * The DOMImplementation interface represents an object providing methods which are not
 * dependent on any particular document.
 * Such an object is returned by the `Document.implementation` property.
 *
 * **The individual methods describe the differences compared to the specs**.
 *
 * @class DOMImplementation
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation MDN
 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-102161490 DOM Level 1 Core
 *      (Initial)
 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#ID-102161490 DOM Level 2 Core
 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-102161490 DOM Level 3 Core
 * @see https://dom.spec.whatwg.org/#domimplementation DOM Living Standard
 * @constructs DOMImplementation
 */
function DOMImplementation() {}

DOMImplementation.prototype = {
	/**
	 * Test if the DOM implementation implements a specific feature and version, as specified in
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#DOMFeatures DOM Features}.
	 *
	 * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given
	 * feature is supported. The different implementations fairly diverged in what kind of
	 * features were reported. The latest version of the spec settled to force this method to
	 * always return true, where the functionality was accurate and in use.
	 *
	 * @deprecated
	 * It is deprecated and modern browsers return true in all cases.
	 * @function DOMImplementation#hasFeature
	 * @param {string} feature
	 * The name of the feature to test.
	 * @param {string} [version]
	 * This is the version number of the feature to test.
	 * @returns {boolean}
	 * Always returns true.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
	 * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-5CED94D7 DOM Level 3 Core
	 */
	hasFeature: function (feature, version) {
		return true;
	},
	/**
	 * Creates a DOM Document object of the specified type with its document element. Note that
	 * based on the {@link DocumentType}
	 * given to create the document, the implementation may instantiate specialized
	 * {@link Document} objects that support additional features than the "Core", such as "HTML"
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML}.
	 * On the other hand, setting the {@link DocumentType} after the document was created makes
	 * this very unlikely to happen. Alternatively, specialized {@link Document} creation methods,
	 * such as createHTMLDocument
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML},
	 * can be used to obtain specific types of {@link Document} objects.
	 *
	 * __It behaves slightly different from the description in the living standard__:
	 * - There is no interface/class `XMLDocument`, it returns a `Document`
	 * instance (with it's `type` set to `'xml'`).
	 * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
	 *
	 * @function DOMImplementation.createDocument
	 * @param {string | null} namespaceURI
	 * The
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-namespaceURI namespace URI}
	 * of the document element to create or null.
	 * @param {string | null} qualifiedName
	 * The
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified name}
	 * of the document element to be created or null.
	 * @param {DocumentType | null} [doctype=null]
	 * The type of document to be created or null. When doctype is not null, its
	 * {@link Node#ownerDocument} attribute is set to the document being created. Default is
	 * `null`
	 * @returns {Document}
	 * A new {@link Document} object with its document element. If the NamespaceURI,
	 * qualifiedName, and doctype are null, the returned {@link Document} is empty with no
	 * document element.
	 * @throws {DOMException}
	 * With code:
	 *
	 * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
	 * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
	 * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed, if the qualifiedName has a
	 * prefix and the namespaceURI is null, or if the qualifiedName is null and the namespaceURI
	 * is different from null, or if the qualifiedName has a prefix that is "xml" and the
	 * namespaceURI is different from "{@link http://www.w3.org/XML/1998/namespace}"
	 * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#Namespaces XML Namespaces},
	 * or if the DOM implementation does not support the "XML" feature but a non-null namespace
	 * URI was provided, since namespaces were defined by XML.
	 * - `WRONG_DOCUMENT_ERR`: Raised if doctype has already been used with a different document
	 * or was created from a different implementation.
	 * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
	 * "XML" and the language exposed through the Document does not support XML Namespaces (such
	 * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
	 * @since DOM Level 2.
	 * @see {@link #createHTMLDocument}
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument DOM Living Standard
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-2-Core-DOM-createDocument DOM
	 *      Level 3 Core
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM
	 *      Level 2 Core (initial)
	 */
	createDocument: function (namespaceURI, qualifiedName, doctype) {
		var contentType = MIME_TYPE.XML_APPLICATION;
		if (namespaceURI === NAMESPACE.HTML) {
			contentType = MIME_TYPE.XML_XHTML_APPLICATION;
		} else if (namespaceURI === NAMESPACE.SVG) {
			contentType = MIME_TYPE.XML_SVG_IMAGE;
		}
		var doc = new Document(PDC, { contentType: contentType });
		doc.implementation = this;
		doc.childNodes = new NodeList();
		doc.doctype = doctype || null;
		if (doctype) {
			doc.appendChild(doctype);
		}
		if (qualifiedName) {
			var root = doc.createElementNS(namespaceURI, qualifiedName);
			doc.appendChild(root);
		}
		return doc;
	},
	/**
	 * Creates an empty DocumentType node. Entity declarations and notations are not made
	 * available. Entity reference expansions and default attribute additions do not occur.
	 *
	 * **This behavior is slightly different from the one in the specs**:
	 * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
	 * - `publicId` and `systemId` contain the raw data including any possible quotes,
	 *   so they can always be serialized back to the original value
	 * - `internalSubset` contains the raw string between `[` and `]` if present,
	 *   but is not parsed or validated in any form.
	 *
	 * @function DOMImplementation#createDocumentType
	 * @param {string} qualifiedName
	 * The {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified
	 * name} of the document type to be created.
	 * @param {string} [publicId]
	 * The external subset public identifier. Stored verbatim including surrounding quotes.
	 * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
	 * if the value is non-empty and does not match the XML `PubidLiteral` production
	 * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12]). Creation-time validation is not
	 * enforced — deferred to a future breaking release.
	 * @param {string} [systemId]
	 * The external subset system identifier. Stored verbatim including surrounding quotes.
	 * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
	 * if the value is non-empty and does not match the XML `SystemLiteral` production
	 * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11]). Creation-time validation is not
	 * enforced — deferred to a future breaking release.
	 * @param {string} [internalSubset]
	 * The internal subset or an empty string if it is not present. Stored verbatim.
	 * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
	 * if the value contains `"]>"`. Creation-time validation is not enforced.
	 * @returns {DocumentType}
	 * A new {@link DocumentType} node with {@link Node#ownerDocument} set to null.
	 * @throws {DOMException}
	 * With code:
	 *
	 * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
	 * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
	 * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed.
	 * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
	 * "XML" and the language exposed through the Document does not support XML Namespaces (such
	 * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
	 * @since DOM Level 2.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType
	 *      MDN
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living
	 *      Standard
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-3-Core-DOM-createDocType DOM
	 *      Level 3 Core
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM
	 *      Level 2 Core
	 * @see https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md#050
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-Core-DocType-internalSubset
	 * @prettierignore
	 */
	createDocumentType: function (qualifiedName, publicId, systemId, internalSubset) {
		validateQualifiedName(qualifiedName);
		var node = new DocumentType(PDC);
		node.name = qualifiedName;
		node.nodeName = qualifiedName;
		node.publicId = publicId || '';
		node.systemId = systemId || '';
		node.internalSubset = internalSubset || '';
		node.childNodes = new NodeList();

		return node;
	},
	/**
	 * Returns an HTML document, that might already have a basic DOM structure.
	 *
	 * __It behaves slightly different from the description in the living standard__:
	 * - If the first argument is `false` no initial nodes are added (steps 3-7 in the specs are
	 * omitted)
	 * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
	 *
	 * @param {string | false} [title]
	 * A string containing the title to give the new HTML document.
	 * @returns {Document}
	 * The HTML document.
	 * @since WHATWG Living Standard.
	 * @see {@link #createDocument}
	 * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
	 * @see https://dom.spec.whatwg.org/#html-document
	 */
	createHTMLDocument: function (title) {
		var doc = new Document(PDC, { contentType: MIME_TYPE.HTML });
		doc.implementation = this;
		doc.childNodes = new NodeList();
		if (title !== false) {
			doc.doctype = this.createDocumentType('html');
			doc.doctype.ownerDocument = doc;
			doc.appendChild(doc.doctype);
			var htmlNode = doc.createElement('html');
			doc.appendChild(htmlNode);
			var headNode = doc.createElement('head');
			htmlNode.appendChild(headNode);
			if (typeof title === 'string') {
				var titleNode = doc.createElement('title');
				titleNode.appendChild(doc.createTextNode(title));
				headNode.appendChild(titleNode);
			}
			htmlNode.appendChild(doc.createElement('body'));
		}
		return doc;
	},
};

/**
 * The DOM Node interface is an abstract base class upon which many other DOM API objects are
 * based, thus letting those object types to be used similarly and often interchangeably. As an
 * abstract class, there is no such thing as a plain Node object. All objects that implement
 * Node functionality are based on one of its subclasses. Most notable are Document, Element,
 * and DocumentFragment.
 *
 * In addition, every kind of DOM node is represented by an interface based on Node. These
 * include Attr, CharacterData (which Text, Comment, CDATASection and ProcessingInstruction are
 * all based on), and DocumentType.
 *
 * In some cases, a particular feature of the base Node interface may not apply to one of its
 * child interfaces; in that case, the inheriting node may return null or throw an exception,
 * depending on circumstances. For example, attempting to add children to a node type that
 * cannot have children will throw an exception.
 *
 * **This behavior is slightly different from the in the specs**:
 * - unimplemented interfaces: `EventTarget`
 *
 * @class
 * @abstract
 * @param {Symbol} symbol
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-1950641247
 * @see https://dom.spec.whatwg.org/#node
 * @prettierignore
 */
function Node(symbol) {
	checkSymbol(symbol);
}

Node.prototype = {
	/**
	 * The first child of this node.
	 *
	 * @type {Node | null}
	 */
	firstChild: null,
	/**
	 * The last child of this node.
	 *
	 * @type {Node | null}
	 */
	lastChild: null,
	/**
	 * The previous sibling of this node.
	 *
	 * @type {Node | null}
	 */
	previousSibling: null,
	/**
	 * The next sibling of this node.
	 *
	 * @type {Node | null}
	 */
	nextSibling: null,
	/**
	 * The parent node of this node.
	 *
	 * @type {Node | null}
	 */
	parentNode: null,
	/**
	 * The parent element of this node.
	 *
	 * @type {Element | null}
	 */
	get parentElement() {
		return this.parentNode && this.parentNode.nodeType === this.ELEMENT_NODE ? this.parentNode : null;
	},
	/**
	 * The child nodes of this node.
	 *
	 * @type {NodeList}
	 */
	childNodes: null,
	/**
	 * The document object associated with this node.
	 *
	 * @type {Document | null}
	 */
	ownerDocument: null,
	/**
	 * The value of this node.
	 *
	 * @type {string | null}
	 */
	nodeValue: null,
	/**
	 * The namespace URI of this node.
	 *
	 * @type {string | null}
	 */
	namespaceURI: null,
	/**
	 * The prefix of the namespace for this node.
	 *
	 * @type {string | null}
	 */
	prefix: null,
	/**
	 * The local part of the qualified name of this node.
	 *
	 * @type {string | null}
	 */
	localName: null,
	/**
	 * The baseURI is currently always `about:blank`,
	 * since that's what happens when you create a document from scratch.
	 *
	 * @type {'about:blank'}
	 */
	baseURI: 'about:blank',
	/**
	 * Is true if this node is part of a document.
	 *
	 * @type {boolean}
	 */
	get isConnected() {
		var rootNode = this.getRootNode();
		return rootNode && rootNode.nodeType === rootNode.DOCUMENT_NODE;
	},
	/**
	 * Checks whether `other` is an inclusive descendant of this node.
	 *
	 * @param {Node | null | undefined} other
	 * The node to check.
	 * @returns {boolean}
	 * True if `other` is an inclusive descendant of this node; false otherwise.
	 * @see https://dom.spec.whatwg.org/#dom-node-contains
	 */
	contains: function (other) {
		if (!other) return false;
		var parent = other;
		do {
			if (this === parent) return true;
			parent = parent.parentNode;
		} while (parent);
		return false;
	},
	/**
	 * @typedef GetRootNodeOptions
	 * @property {boolean} [composed=false]
	 */
	/**
	 * Searches for the root node of this node.
	 *
	 * **This behavior is slightly different from the in the specs**:
	 * - ignores `options.composed`, since `ShadowRoot`s are unsupported, always returns root.
	 *
	 * @param {GetRootNodeOptions} [options]
	 * @returns {Node}
	 * Root node.
	 * @see https://dom.spec.whatwg.org/#dom-node-getrootnode
	 * @see https://dom.spec.whatwg.org/#concept-shadow-including-root
	 */
	getRootNode: function (options) {
		var parent = this;
		do {
			if (!parent.parentNode) {
				return parent;
			}
			parent = parent.parentNode;
		} while (parent);
	},
	/**
	 * Checks whether the given node is equal to this node.
	 *
	 * Two nodes are equal when they have the same type, defining characteristics (for the type),
	 * and the same childNodes. The comparison is iterative to avoid stack overflows on
	 * deeply-nested trees. Attribute nodes of each Element pair are also pushed onto the stack
	 * and compared the same way.
	 *
	 * @param {Node} [otherNode]
	 * @returns {boolean}
	 * @see https://dom.spec.whatwg.org/#concept-node-equals
	 * @see ../docs/walk-dom.md.
	 */
	isEqualNode: function (otherNode) {
		if (!otherNode) return false;

		// Use an explicit {node, other} pair stack to avoid call-stack overflow on deep trees.
		// walkDOM cannot be used here — parallel two-tree traversal requires pairing
		// corresponding nodes at each step across both trees simultaneously.
		var stack = [{ node: this, other: otherNode }];
		while (stack.length > 0) {
			var pair = stack.pop();
			var node = pair.node;
			var other = pair.other;

			if (node.nodeType !== other.nodeType) return false;

			switch (node.nodeType) {
				case node.DOCUMENT_TYPE_NODE:
					if (node.name !== other.name) return false;
					if (node.publicId !== other.publicId) return false;
					if (node.systemId !== other.systemId) return false;
					break;
				case node.ELEMENT_NODE:
					if (node.namespaceURI !== other.namespaceURI) return false;
					if (node.prefix !== other.prefix) return false;
					if (node.localName !== other.localName) return false;
					if (node.attributes.length !== other.attributes.length) return false;
					for (var i = 0; i < node.attributes.length; i++) {
						var attr = node.attributes.item(i);
						var otherAttr = other.getAttributeNodeNS(attr.namespaceURI, attr.localName);
						if (!otherAttr) return false;
						stack.push({ node: attr, other: otherAttr });
					}
					break;
				case node.ATTRIBUTE_NODE:
					if (node.namespaceURI !== other.namespaceURI) return false;
					if (node.localName !== other.localName) return false;
					if (node.value !== other.value) return false;
					break;
				case node.PROCESSING_INSTRUCTION_NODE:
					if (node.target !== other.target || node.data !== other.data) return false;
					break;
				case node.TEXT_NODE:
				case node.CDATA_SECTION_NODE:
				case node.COMMENT_NODE:
					if (node.data !== other.data) return false;
					break;
			}

			if (node.childNodes.length !== other.childNodes.length) return false;

			// Push children in reverse order so index 0 is processed first (LIFO).
			for (var i = node.childNodes.length - 1; i >= 0; i--) {
				stack.push({ node: node.childNodes[i], other: other.childNodes[i] });
			}
		}

		return true;
	},
	/**
	 * Checks whether or not the given node is this node.
	 *
	 * @param {Node} [otherNode]
	 */
	isSameNode: function (otherNode) {
		return this === otherNode;
	},
	/**
	 * Inserts a node before a reference node as a child of this node.
	 *
	 * @param {Node} newChild
	 * The new child node to be inserted.
	 * @param {Node | null} refChild
	 * The reference node before which newChild will be inserted.
	 * @returns {Node}
	 * The new child node successfully inserted.
	 * @throws {DOMException}
	 * Throws a DOMException if inserting the node would result in a DOM tree that is not
	 * well-formed, or if `child` is provided but is not a child of `parent`.
	 * See {@link _insertBefore} for more details.
	 * @since Modified in DOM L2
	 */
	insertBefore: function (newChild, refChild) {
		return _insertBefore(this, newChild, refChild);
	},
	/**
	 * Replaces an old child node with a new child node within this node.
	 *
	 * @param {Node} newChild
	 * The new node that is to replace the old node.
	 * If it already exists in the DOM, it is removed from its original position.
	 * @param {Node} oldChild
	 * The existing child node to be replaced.
	 * @returns {Node}
	 * Returns the replaced child node.
	 * @throws {DOMException}
	 * Throws a DOMException if replacing the node would result in a DOM tree that is not
	 * well-formed, or if `oldChild` is not a child of `this`.
	 * This can also occur if the pre-replacement validity assertion fails.
	 * See {@link _insertBefore}, {@link Node.removeChild}, and
	 * {@link assertPreReplacementValidityInDocument} for more details.
	 * @see https://dom.spec.whatwg.org/#concept-node-replace
	 */
	replaceChild: function (newChild, oldChild) {
		_insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
		if (oldChild) {
			this.removeChild(oldChild);
		}
	},
	/**
	 * Removes an existing child node from this node.
	 *
	 * @param {Node} oldChild
	 * The child node to be removed.
	 * @returns {Node}
	 * Returns the removed child node.
	 * @throws {DOMException}
	 * Throws a DOMException if `oldChild` is not a child of `this`.
	 * See {@link _removeChild} for more details.
	 */
	removeChild: function (oldChild) {
		return _removeChild(this, oldChild);
	},
	/**
	 * Appends a child node to this node.
	 *
	 * @param {Node} newChild
	 * The child node to be appended to this node.
	 * If it already exists in the DOM, it is removed from its original position.
	 * @returns {Node}
	 * Returns the appended child node.
	 * @throws {DOMException}
	 * Throws a DOMException if appending the node would result in a DOM tree that is not
	 * well-formed, or if `newChild` is not a valid Node.
	 * See {@link insertBefore} for more details.
	 */
	appendChild: function (newChild) {
		return this.insertBefore(newChild, null);
	},
	/**
	 * Determines whether this node has any child nodes.
	 *
	 * @returns {boolean}
	 * Returns true if this node has any child nodes, and false otherwise.
	 */
	hasChildNodes: function () {
		return this.firstChild != null;
	},
	/**
	 * Creates a copy of the calling node.
	 *
	 * @param {boolean} deep
	 * If true, the contents of the node are recursively copied.
	 * If false, only the node itself (and its attributes, if it is an element) are copied.
	 * @returns {Node}
	 * Returns the newly created copy of the node.
	 * @throws {DOMException}
	 * May throw a DOMException if operations within {@link Element#setAttributeNode} or
	 * {@link Node#appendChild} (which are potentially invoked in this method) do not meet their
	 * specific constraints.
	 * @see {@link cloneNode}
	 */
	cloneNode: function (deep) {
		return cloneNode(this.ownerDocument || this, this, deep);
	},
	/**
	 * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
	 * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
	 *
	 * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
	 * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
	 * nodes.
	 *
	 * This method iterativly traverses all child nodes to normalize all descendent nodes within
	 * the subtree.
	 *
	 * @throws {DOMException}
	 * May throw a DOMException if operations within removeChild or appendData (which are
	 * potentially invoked in this method) do not meet their specific constraints.
	 * @since Modified in DOM Level 2
	 * @see {@link Node.removeChild}
	 * @see {@link CharacterData.appendData}
	 * @see ../docs/walk-dom.md.
	 */
	normalize: function () {
		walkDOM(this, null, {
			enter: function (node) {
				// Merge adjacent text children of node before walkDOM schedules them.
				// walkDOM reads lastChild/previousSibling after enter returns, so the
				// surviving post-merge children are what it descends into.
				var child = node.firstChild;
				while (child) {
					var next = child.nextSibling;
					if (next !== null && next.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) {
						// Merge the whole run of adjacent text nodes at once: gather the
						// following text siblings' data, unlink them in a single pass, and
						// re-index the child list a single time. Per-sibling `removeChild`
						// (each an O(K) re-index) plus per-sibling `appendData` (each an O(K)
						// string rebuild) is O(K^2) over a long run of single-character text
						// nodes; this keeps it O(K). The first text node of the run survives
						// and carries the concatenated data, preserving node identity and
						// locator semantics.
						var tail = [];
						var sibling = next;
						while (sibling !== null && sibling.nodeType === TEXT_NODE) {
							tail.push(sibling.data);
							sibling = sibling.nextSibling;
						}
						// `sibling` is now the first non-text node after the run, or null.
						var removed = child.nextSibling;
						while (removed !== sibling) {
							var following = removed.nextSibling;
							removed.parentNode = null;
							removed.previousSibling = null;
							removed.nextSibling = null;
							removed = following;
						}
						child.nextSibling = sibling;
						if (sibling !== null) {
							sibling.previousSibling = child;
						} else {
							node.lastChild = child;
						}
						child.appendData(tail.join('')); // single O(K) string rebuild
						_onUpdateChild(node.ownerDocument, node); // single O(K) re-index
						child = sibling;
					} else {
						child = next;
					}
				}
				return true; // descend into surviving children
			},
		});
	},
	/**
	 * Checks whether the DOM implementation implements a specific feature and its version.
	 *
	 * @deprecated
	 * Since `DOMImplementation.hasFeature` is deprecated and always returns true.
	 * @param {string} feature
	 * The package name of the feature to test. This is the same name that can be passed to the
	 * method `hasFeature` on `DOMImplementation`.
	 * @param {string} version
	 * This is the version number of the package name to test.
	 * @returns {boolean}
	 * Returns true in all cases in the current implementation.
	 * @since Introduced in DOM Level 2
	 * @see {@link DOMImplementation.hasFeature}
	 */
	isSupported: function (feature, version) {
		return this.ownerDocument.implementation.hasFeature(feature, version);
	},
	/**
	 * Look up the prefix associated to the given namespace URI, starting from this node.
	 * **The default namespace declarations are ignored by this method.**
	 * See Namespace Prefix Lookup for details on the algorithm used by this method.
	 *
	 * **This behavior is different from the in the specs**:
	 * - no node type specific handling
	 * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
	 *
	 * @param {string | null} namespaceURI
	 * The namespace URI for which to find the associated prefix.
	 * @returns {string | null}
	 * The associated prefix, if found; otherwise, null.
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
	 * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
	 * @see https://github.com/xmldom/xmldom/issues/322
	 * @prettierignore
	 */
	lookupPrefix: function (namespaceURI) {
		var el = this;
		while (el) {
			var map = el._nsMap;
			//console.dir(map)
			if (map) {
				for (var n in map) {
					if (hasOwn(map, n) && map[n] === namespaceURI) {
						return n;
					}
				}
			}
			el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
		}
		return null;
	},
	/**
	 * This function is used to look up the namespace URI associated with the given prefix,
	 * starting from this node.
	 *
	 * **This behavior is different from the in the specs**:
	 * - no node type specific handling
	 * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
	 *
	 * @param {string | null} prefix
	 * The prefix for which to find the associated namespace URI.
	 * @returns {string | null}
	 * The associated namespace URI, if found; otherwise, null.
	 * @since DOM Level 3
	 * @see https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespaceURI
	 * @prettierignore
	 */
	lookupNamespaceURI: function (prefix) {
		var el = this;
		while (el) {
			var map = el._nsMap;
			//console.dir(map)
			if (map) {
				if (hasOwn(map, prefix)) {
					return map[prefix];
				}
			}
			el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
		}
		return null;
	},
	/**
	 * Determines whether the given namespace URI is the default namespace.
	 *
	 * The function works by looking up the prefix associated with the given namespace URI. If no
	 * prefix is found (i.e., the namespace URI is not registered in the namespace map of this
	 * node or any of its ancestors), it returns `true`, implying the namespace URI is considered
	 * the default.
	 *
	 * **This behavior is different from the in the specs**:
	 * - no node type specific handling
	 * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
	 *
	 * @param {string | null} namespaceURI
	 * The namespace URI to be checked.
	 * @returns {boolean}
	 * Returns true if the given namespace URI is the default namespace, false otherwise.
	 * @since DOM Level 3
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isDefaultNamespace
	 * @see https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace
	 * @prettierignore
	 */
	isDefaultNamespace: function (namespaceURI) {
		var prefix = this.lookupPrefix(namespaceURI);
		return prefix == null;
	},
	/**
	 * Compares the reference node with a node with regard to their position in the document and
	 * according to the document order.
	 *
	 * @param {Node} other
	 * The node to compare the reference node to.
	 * @returns {number}
	 * Returns how the node is positioned relatively to the reference node according to the
	 * bitmask. 0 if reference node and given node are the same.
	 * @since DOM Level 3
	 * @see https://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-compare
	 * @see https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
	 */
	compareDocumentPosition: function (other) {
		if (this === other) return 0;
		var node1 = other;
		var node2 = this;
		var attr1 = null;
		var attr2 = null;
		if (node1 instanceof Attr) {
			attr1 = node1;
			node1 = attr1.ownerElement;
		}
		if (node2 instanceof Attr) {
			attr2 = node2;
			node2 = attr2.ownerElement;
			if (attr1 && node1 && node2 === node1) {
				for (var i = 0, attr; (attr = node2.attributes[i]); i++) {
					if (attr === attr1)
						return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
					if (attr === attr2)
						return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
				}
			}
		}
		if (!node1 || !node2 || node2.ownerDocument !== node1.ownerDocument) {
			return (
				DocumentPosition.DOCUMENT_POSITION_DISCONNECTED +
				DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC +
				(docGUID(node2.ownerDocument) > docGUID(node1.ownerDocument)
					? DocumentPosition.DOCUMENT_POSITION_FOLLOWING
					: DocumentPosition.DOCUMENT_POSITION_PRECEDING)
			);
		}
		if (attr2 && node1 === node2) {
			return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
		}
		if (attr1 && node1 === node2) {
			return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
		}

		var chain1 = [];
		var ancestor1 = node1.parentNode;
		while (ancestor1) {
			if (!attr2 && ancestor1 === node2) {
				return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
			}
			chain1.push(ancestor1);
			ancestor1 = ancestor1.parentNode;
		}
		chain1.reverse();

		var chain2 = [];
		var ancestor2 = node2.parentNode;
		while (ancestor2) {
			if (!attr1 && ancestor2 === node1) {
				return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
			}
			chain2.push(ancestor2);
			ancestor2 = ancestor2.parentNode;
		}
		chain2.reverse();

		var ca = commonAncestor(chain1, chain2);
		for (var n in ca.childNodes) {
			var child = ca.childNodes[n];
			if (child === node2) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
			if (child === node1) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
			if (chain2.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
			if (chain1.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
		}
		return 0;
	},
};

/**
 * Encodes special XML characters to their corresponding entities.
 *
 * @param {string} c
 * The character to be encoded.
 * @returns {string}
 * The encoded character.
 * @private
 */
function _xmlEncoder(c) {
	return (
		(c == '<' && '&lt;') || (c == '>' && '&gt;') || (c == '&' && '&amp;') || (c == '"' && '&quot;') || '&#' + c.charCodeAt() + ';'
	);
}

copy(NodeType, Node);
copy(NodeType, Node.prototype);
copy(DocumentPosition, Node);
copy(DocumentPosition, Node.prototype);

/**
 * Visits every node in the subtree rooted at `node` in depth-first pre-order.
 *
 * Delegates to {@link walkDOM} for traversal. The `callback` is called on each node;
 * if it returns a truthy value, traversal stops immediately.
 *
 * @param {Node} node
 * Root of the subtree to visit.
 * @param {function(Node): *} callback
 * Called for each node. A truthy return value stops traversal early.
 */
function _visitNode(node, callback) {
	walkDOM(node, null, {
		enter: function (n) {
			return callback(n) ? walkDOM.STOP : true;
		},
	});
}

/**
 * Depth-first pre/post-order DOM tree walker.
 *
 * Visits every node in the subtree rooted at `node`. For each node:
 *
 * 1. Calls `callbacks.enter(node, context)` before descending into the node's children. The
 * return value becomes the `context` passed to each child's `enter` call and to the matching
 * `exit` call.
 * 2. If `enter` returns `null` or `undefined`, the node's children are skipped;
 * sibling traversal continues normally.
 * 3. If `enter` returns `walkDOM.STOP`, the entire traversal is aborted immediately — no
 * further `enter` or `exit` calls are made.
 * 4. `lastChild` and `previousSibling` are read **after** `enter` returns, so `enter` may
 * safely modify the node's own child list before the walker descends. Modifying siblings of
 * the current node or any other part of the tree produces unpredictable results: nodes already
 * queued on the stack are visited regardless of DOM changes, and newly inserted nodes outside
 * the current child list are never visited.
 * 5. Calls `callbacks.exit(node, context)` (if provided) after all of a node's children have
 * been visited, passing the same `context` that `enter`
 * returned for that node.
 *
 * This implementation uses an explicit stack and does not recurse — it is safe on arbitrarily
 * deep trees.
 *
 * @param {Node} node
 * Root of the subtree to walk.
 * @param {*} context
 * Initial context value passed to the root node's `enter`.
 * @param {{ enter: function(Node, *): *, exit?: function(Node, *): void }} callbacks
 * @returns {void | walkDOM.STOP}
 * @see ../docs/walk-dom.md.
 */
function walkDOM(node, context, callbacks) {
	// Each stack frame is {node, context, phase}:
	//   walkDOM.ENTER — call enter, then push children
	//   walkDOM.EXIT  — call exit
	var stack = [{ node: node, context: context, phase: walkDOM.ENTER }];
	while (stack.length > 0) {
		var frame = stack.pop();
		if (frame.phase === walkDOM.ENTER) {
			var childContext = callbacks.enter(frame.node, frame.context);
			if (childContext === walkDOM.STOP) {
				return walkDOM.STOP;
			}
			// Push exit frame before children so it fires after all children are processed (Last In First Out)
			stack.push({ node: frame.node, context: childContext, phase: walkDOM.EXIT });
			if (childContext === null || childContext === undefined) {
				continue; // skip children
			}
			// lastChild is read after enter returns, so enter may modify the child list.
			var child = frame.node.lastChild;
			// Traverse from lastChild backwards so that pushing onto the stack
			// naturally yields firstChild on top (processed first).
			while (child) {
				stack.push({ node: child, context: childContext, phase: walkDOM.ENTER });
				child = child.previousSibling;
			}
		} else {
			// frame.phase === walkDOM.EXIT
			if (callbacks.exit) {
				callbacks.exit(frame.node, frame.context);
			}
		}
	}
}

/**
 * Sentinel value returned from a `walkDOM` `enter` callback to abort the entire traversal
 * immediately.
 *
 * @type {symbol}
 */
walkDOM.STOP = Symbol('walkDOM.STOP');
/**
 * Phase constant for a stack frame that has not yet been visited.
 * The `enter` callback is called and children are scheduled.
 *
 * @type {number}
 */
walkDOM.ENTER = 0;
/**
 * Phase constant for a stack frame whose subtree has been fully visited.
 * The `exit` callback is called.
 *
 * @type {number}
 */
walkDOM.EXIT = 1;

/**
 * @typedef DocumentOptions
 * @property {string} [contentType=MIME_TYPE.XML_APPLICATION]
 */
/**
 * The Document interface describes the common properties and methods for any kind of document.
 *
 * It should usually be created using `new DOMImplementation().createDocument(...)`
 * or `new DOMImplementation().createHTMLDocument(...)`.
 *
 * The constructor is considered a private API and offers to initially set the `contentType`
 * property via it's options parameter.
 *
 * @class
 * @param {Symbol} symbol
 * @param {DocumentOptions} [options]
 * @augments Node
 * @private
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document
 * @see https://dom.spec.whatwg.org/#interface-document
 */
function Document(symbol, options) {
	checkSymbol(symbol);

	var opt = options || {};
	this.ownerDocument = this;
	/**
	 * The mime type of the document is determined at creation time and can not be modified.
	 *
	 * @type {string}
	 * @see https://dom.spec.whatwg.org/#concept-document-content-type
	 * @see {@link DOMImplementation}
	 * @see {@link MIME_TYPE}
	 * @readonly
	 */
	this.contentType = opt.contentType || MIME_TYPE.XML_APPLICATION;
	/**
	 * @type {'html' | 'xml'}
	 * @see https://dom.spec.whatwg.org/#concept-document-type
	 * @see {@link DOMImplementation}
	 * @readonly
	 */
	this.type = isHTMLMimeType(this.contentType) ? 'html' : 'xml';
}

/**
 * Updates the namespace mapping of an element when a new attribute is added.
 *
 * @param {Document} doc
 * The document that the element belongs to.
 * @param {Element} el
 * The element to which the attribute is being added.
 * @param {Attr} newAttr
 * The new attribute being added.
 * @private
 */
function _onAddAttribute(doc, el, newAttr) {
	doc && doc._inc++;
	var ns = newAttr.namespaceURI;
	if (ns === NAMESPACE.XMLNS) {
		//update namespace
		el._nsMap[newAttr.prefix ? newAttr.localName : ''] = newAttr.value;
	}
}

/**
 * Updates the namespace mapping of an element when an attribute is removed.
 *
 * @param {Document} doc
 * The document that the element belongs to.
 * @param {Element} el
 * The element from which the attribute is being removed.
 * @param {Attr} newAttr
 * The attribute being removed.
 * @param {boolean} remove
 * Indicates whether the attribute is to be removed.
 * @private
 */
function _onRemoveAttribute(doc, el, newAttr, remove) {
	doc && doc._inc++;
	var ns = newAttr.namespaceURI;
	if (ns === NAMESPACE.XMLNS) {
		//update namespace
		delete el._nsMap[newAttr.prefix ? newAttr.localName : ''];
	}
}

/**
 * Updates `parent.childNodes`, adjusting the indexed items and its `length`.
 * If `newChild` is provided and has no nextSibling, it will be appended.
 * Otherwise, it's assumed that an item has been removed or inserted,
 * and `parent.firstNode` and its `.nextSibling` to re-indexing all child nodes of `parent`.
 *
 * @param {Document} doc
 * The parent document of `el`.
 * @param {Node} parent
 * The parent node whose childNodes list needs to be updated.
 * @param {Node} [newChild]
 * The new child node to be appended. If not provided, the function assumes a node has been
 * removed.
 * @private
 */
function _onUpdateChild(doc, parent, newChild) {
	if (doc && doc._inc) {
		doc._inc++;
		var childNodes = parent.childNodes;
		// assumes nextSibling and previousSibling were already configured upfront
		if (newChild && !newChild.nextSibling) {
			// if an item has been appended, we only need to update the last index and the length
			childNodes[childNodes.length++] = newChild;
		} else {
			// otherwise we need to reindex all items,
			// which can take a while when processing nodes with a lot of children
			var child = parent.firstChild;
			var i = 0;
			while (child) {
				childNodes[i++] = child;
				child = child.nextSibling;
			}
			childNodes.length = i;
			delete childNodes[childNodes.length];
		}
	}
}

/**
 * Removes the connections between `parentNode` and `child`
 * and any existing `child.previousSibling` or `child.nextSibling`.
 *
 * @param {Node} parentNode
 * The parent node from which the child node is to be removed.
 * @param {Node} child
 * The child node to be removed from the parentNode.
 * @returns {Node}
 * Returns the child node that was removed.
 * @throws {DOMException}
 * With code:
 * - {@link DOMException.NOT_FOUND_ERR} If the parentNode is not the parent of the child node.
 * @private
 * @see https://github.com/xmldom/xmldom/issues/135
 * @see https://github.com/xmldom/xmldom/issues/145
 */
function _removeChild(parentNode, child) {
	if (parentNode !== child.parentNode) {
		throw new DOMException(DOMException.NOT_FOUND_ERR, "child's parent is not parent");
	}
	var oldPreviousSibling = child.previousSibling;
	var oldNextSibling = child.nextSibling;
	if (oldPreviousSibling) {
		oldPreviousSibling.nextSibling = oldNextSibling;
	} else {
		parentNode.firstChild = oldNextSibling;
	}
	if (oldNextSibling) {
		oldNextSibling.previousSibling = oldPreviousSibling;
	} else {
		parentNode.lastChild = oldPreviousSibling;
	}
	_onUpdateChild(parentNode.ownerDocument, parentNode);
	child.parentNode = null;
	child.previousSibling = null;
	child.nextSibling = null;
	return child;
}

/**
 * Returns `true` if `node` can be a parent for insertion.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function hasValidParentNodeType(node) {
	return (
		node &&
		(node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE)
	);
}

/**
 * Returns `true` if `node` can be inserted according to it's `nodeType`.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function hasInsertableNodeType(node) {
	return (
		node &&
		(node.nodeType === Node.CDATA_SECTION_NODE ||
			node.nodeType === Node.COMMENT_NODE ||
			node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
			node.nodeType === Node.DOCUMENT_TYPE_NODE ||
			node.nodeType === Node.ELEMENT_NODE ||
			node.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
			node.nodeType === Node.TEXT_NODE)
	);
}

/**
 * Returns true if `node` is a DOCTYPE node.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function isDocTypeNode(node) {
	return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
}

/**
 * Returns true if the node is an element.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function isElementNode(node) {
	return node && node.nodeType === Node.ELEMENT_NODE;
}
/**
 * Returns true if `node` is a text node.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function isTextNode(node) {
	return node && node.nodeType === Node.TEXT_NODE;
}

/**
 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
 * according to the presence and position of a doctype node on the same level.
 *
 * @param {Document} doc
 * The document node.
 * @param {Node} child
 * The node that would become the nextSibling if the element would be inserted.
 * @returns {boolean}
 * `true` if an element can be inserted before child.
 * @private
 */
function isElementInsertionPossible(doc, child) {
	var parentChildNodes = doc.childNodes || [];
	if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
		return false;
	}
	var docTypeNode = find(parentChildNodes, isDocTypeNode);
	return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}

/**
 * Check if en element node can be inserted before `child`, or at the end if child is falsy,
 * according to the presence and position of a doctype node on the same level.
 *
 * @param {Node} doc
 * The document node.
 * @param {Node} child
 * The node that would become the nextSibling if the element would be inserted.
 * @returns {boolean}
 * `true` if an element can be inserted before child.
 * @private
 */
function isElementReplacementPossible(doc, child) {
	var parentChildNodes = doc.childNodes || [];

	function hasElementChildThatIsNotChild(node) {
		return isElementNode(node) && node !== child;
	}

	if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
		return false;
	}
	var docTypeNode = find(parentChildNodes, isDocTypeNode);
	return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
}

/**
 * Asserts pre-insertion validity of a node into a parent before a child.
 * Throws errors for invalid node combinations that would result in an ill-formed DOM.
 *
 * @param {Node} parent
 * The parent node to insert `node` into.
 * @param {Node} node
 * The node to insert.
 * @param {Node | null} child
 * The node that should become the `nextSibling` of `node`. If null, no sibling is considered.
 * @throws {DOMException}
 * With code:
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `parent` is not a Document,
 * DocumentFragment, or Element node.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is a host-including inclusive
 * ancestor of `parent`. (Currently not implemented)
 * - {@link DOMException.NOT_FOUND_ERR} If `child` is non-null and its `parent` is not
 * `parent`.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is not a DocumentFragment,
 * DocumentType, Element, or CharacterData node.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If either `node` is a Text node and `parent` is
 * a document, or if `node` is a doctype and `parent` is not a document.
 * @private
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreInsertionValidity1to5(parent, node, child) {
	// 1. If `parent` is not a Document, DocumentFragment, or Element node, then throw a "HierarchyRequestError" DOMException.
	if (!hasValidParentNodeType(parent)) {
		throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Unexpected parent node type ' + parent.nodeType);
	}
	// 2. If `node` is a host-including inclusive ancestor of `parent`, then throw a "HierarchyRequestError" DOMException.
	// not implemented!
	// 3. If `child` is non-null and its parent is not `parent`, then throw a "NotFoundError" DOMException.
	if (child && child.parentNode !== parent) {
		throw new DOMException(DOMException.NOT_FOUND_ERR, 'child not in parent');
	}
	if (
		// 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
		!hasInsertableNodeType(node) ||
		// 5. If either `node` is a Text node and `parent` is a document,
		// the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
		// || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
		// or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
		(isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE)
	) {
		throw new DOMException(
			DOMException.HIERARCHY_REQUEST_ERR,
			'Unexpected node type ' + node.nodeType + ' for parent node type ' + parent.nodeType
		);
	}
}

/**
 * Asserts pre-insertion validity of a node into a document before a child.
 * Throws errors for invalid node combinations that would result in an ill-formed DOM.
 *
 * @param {Document} parent
 * The parent node to insert `node` into.
 * @param {Node} node
 * The node to insert.
 * @param {Node | undefined} child
 * The node that should become the `nextSibling` of `node`. If undefined, no sibling is
 * considered.
 * @returns {Node}
 * @throws {DOMException}
 * With code:
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is a DocumentFragment with more than
 * one element child or has a Text node child.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is a DocumentFragment with one
 * element child and either `parent` has an element child, `child` is a doctype, or `child` is
 * non-null and a doctype is following `child`.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is an Element and `parent` has an
 * element child, `child` is a doctype, or `child` is non-null and a doctype is following
 * `child`.
 * - {@link DOMException.HIERARCHY_REQUEST_ERR} If `node` is a DocumentType and `parent` has a
 * doctype child, `child` is non-null and an element is preceding `child`, or `child` is null
 * and `parent` has an element child.
 * @private
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreInsertionValidityInDocument(parent, node, child) {
	var parentChildNodes = parent.childNodes || [];
	var nodeChildNodes = node.childNodes || [];

	// DocumentFragment
	if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		var nodeChildElements = nodeChildNodes.filter(isElementNode);
		// If node has more than one element child or has a Text node child.
		if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
		}
		// Otherwise, if `node` has one element child and either `parent` has an element child,
		// `child` is a doctype, or `child` is non-null and a doctype is following `child`.
		if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
		}
	}
	// Element
	if (isElementNode(node)) {
		// `parent` has an element child, `child` is a doctype,
		// or `child` is non-null and a doctype is following `child`.
		if (!isElementInsertionPossible(parent, child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
		}
	}
	// DocumentType
	if (isDocTypeNode(node)) {
		// `parent` has a doctype child,
		if (find(parentChildNodes, isDocTypeNode)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
		}
		var parentElementChild = find(parentChildNodes, isElementNode);
		// `child` is non-null and an element is preceding `child`,
		if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
		}
		// or `child` is null and `parent` has an element child.
		if (!child && parentElementChild) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Doctype can not be appended since element is present');
		}
	}
}

/**
 * @param {Document} parent
 * The parent node to insert `node` into.
 * @param {Node} node
 * The node to insert.
 * @param {Node | undefined} child
 * the node that should become the `nextSibling` of `node`
 * @returns {Node}
 * @throws {DOMException}
 * For several node combinations that would create a DOM that is not well-formed.
 * @throws {DOMException}
 * If `child` is provided but is not a child of `parent`.
 * @private
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 * @see https://dom.spec.whatwg.org/#concept-node-replace
 */
function assertPreReplacementValidityInDocument(parent, node, child) {
	var parentChildNodes = parent.childNodes || [];
	var nodeChildNodes = node.childNodes || [];

	// DocumentFragment
	if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		var nodeChildElements = nodeChildNodes.filter(isElementNode);
		// If `node` has more than one element child or has a Text node child.
		if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'More than one element or text in fragment');
		}
		// Otherwise, if `node` has one element child and either `parent` has an element child that is not `child` or a doctype is following `child`.
		if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Element in fragment can not be inserted before doctype');
		}
	}
	// Element
	if (isElementNode(node)) {
		// `parent` has an element child that is not `child` or a doctype is following `child`.
		if (!isElementReplacementPossible(parent, child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Only one element can be added and only after doctype');
		}
	}
	// DocumentType
	if (isDocTypeNode(node)) {
		function hasDoctypeChildThatIsNotChild(node) {
			return isDocTypeNode(node) && node !== child;
		}

		// `parent` has a doctype child that is not `child`,
		if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Only one doctype is allowed');
		}
		var parentElementChild = find(parentChildNodes, isElementNode);
		// or an element is preceding `child`.
		if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
			throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, 'Doctype can only be inserted before an element');
		}
	}
}

/**
 * Inserts a node into a parent node before a child node.
 *
 * @param {Node} parent
 * The parent node to insert the node into.
 * @param {Node} node
 * The node to insert into the parent.
 * @param {Node | null} child
 * The node that should become the next sibling of the node.
 * If null, the function inserts the node at the end of the children of the parent node.
 * @param {Function} [_inDocumentAssertion]
 * An optional function to check pre-insertion validity if parent is a document node.
 * Defaults to {@link assertPreInsertionValidityInDocument}
 * @returns {Node}
 * Returns the inserted node.
 * @throws {DOMException}
 * Throws a DOMException if inserting the node would result in a DOM tree that is not
 * well-formed. See {@link assertPreInsertionValidity1to5},
 * {@link assertPreInsertionValidityInDocument}.
 * @throws {DOMException}
 * Throws a DOMException if child is provided but is not a child of the parent. See
 * {@link Node.removeChild}
 * @private
 * @see https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity
 */
function _insertBefore(parent, node, child, _inDocumentAssertion) {
	// To ensure pre-insertion validity of a node into a parent before a child, run these steps:
	assertPreInsertionValidity1to5(parent, node, child);

	// If parent is a document, and any of the statements below, switched on the interface node implements,
	// are true, then throw a "HierarchyRequestError" DOMException.
	if (parent.nodeType === Node.DOCUMENT_NODE) {
		(_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
	}

	var cp = node.parentNode;
	if (cp) {
		cp.removeChild(node); //remove and update
	}
	if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
		var newFirst = node.firstChild;
		if (newFirst == null) {
			return node;
		}
		var newLast = node.lastChild;
	} else {
		newFirst = newLast = node;
	}
	var pre = child ? child.previousSibling : parent.lastChild;

	newFirst.previousSibling = pre;
	newLast.nextSibling = child;

	if (pre) {
		pre.nextSibling = newFirst;
	} else {
		parent.firstChild = newFirst;
	}
	if (child == null) {
		parent.lastChild = newLast;
	} else {
		child.previousSibling = newLast;
	}
	do {
		newFirst.parentNode = parent;
	} while (newFirst !== newLast && (newFirst = newFirst.nextSibling));
	_onUpdateChild(parent.ownerDocument || parent, parent, node);
	if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
		node.firstChild = node.lastChild = null;
	}

	return node;
}

Document.prototype = {
	/**
	 * The implementation that created this document.
	 *
	 * @type DOMImplementation
	 * @readonly
	 */
	implementation: null,
	nodeName: '#document',
	nodeType: DOCUMENT_NODE,
	/**
	 * The DocumentType node of the document.
	 *
	 * @type DocumentType
	 * @readonly
	 */
	doctype: null,
	documentElement: null,
	_inc: 1,

	insertBefore: function (newChild, refChild) {
		//raises
		if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
			var child = newChild.firstChild;
			while (child) {
				var next = child.nextSibling;
				this.insertBefore(child, refChild);
				child = next;
			}
			return newChild;
		}
		_insertBefore(this, newChild, refChild);
		newChild.ownerDocument = this;
		if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
			this.documentElement = newChild;
		}

		return newChild;
	},
	removeChild: function (oldChild) {
		var removed = _removeChild(this, oldChild);
		if (removed === this.documentElement) {
			this.documentElement = null;
		}
		return removed;
	},
	replaceChild: function (newChild, oldChild) {
		//raises
		_insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
		newChild.ownerDocument = this;
		if (oldChild) {
			this.removeChild(oldChild);
		}
		if (isElementNode(newChild)) {
			this.documentElement = newChild;
		}
	},
	/**
	 * Imports a node from another document into this document, creating a new copy owned by this
	 * document. The source node and its subtree are not modified.
	 *
	 * @param {Node} importedNode
	 * The node to import.
	 * @param {boolean} deep
	 * If true, the contents of the node are recursively imported.
	 * If false, only the node itself (and its attributes, if it is an element) are imported.
	 * @returns {Node}
	 * Returns the newly created import of the node.
	 * @see {@link importNode}
	 * @see {@link https://dom.spec.whatwg.org/#dom-document-importnode}
	 */
	importNode: function (importedNode, deep) {
		return importNode(this, importedNode, deep);
	},
	// Introduced in DOM Level 2:
	getElementById: function (id) {
		var rtv = null;
		_visitNode(this.documentElement, function (node) {
			if (node.nodeType == ELEMENT_NODE) {
				if (node.getAttribute('id') == id) {
					rtv = node;
					return true;
				}
			}
		});
		return rtv;
	},

	/**
	 * Creates a new `Element` that is owned by this `Document`.
	 * In HTML Documents `localName` is the lower cased `tagName`,
	 * otherwise no transformation is being applied.
	 * When `contentType` implies the HTML namespace, it will be set as `namespaceURI`.
	 *
	 * __This implementation differs from the specification:__ - The provided name is not checked
	 * against the `Name` production,
	 * so no related error will be thrown.
	 * - There is no interface `HTMLElement`, it is always an `Element`.
	 * - There is no support for a second argument to indicate using custom elements.
	 *
	 * @param {string} tagName
	 * @returns {Element}
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
	 * @see https://dom.spec.whatwg.org/#dom-document-createelement
	 * @see https://dom.spec.whatwg.org/#concept-create-element
	 */
	createElement: function (tagName) {
		var node = new Element(PDC);
		node.ownerDocument = this;
		if (this.type === 'html') {
			tagName = tagName.toLowerCase();
		}
		if (hasDefaultHTMLNamespace(this.contentType)) {
			node.namespaceURI = NAMESPACE.HTML;
		}
		node.nodeName = tagName;
		node.tagName = tagName;
		node.localName = tagName;
		node.childNodes = new NodeList();
		var attrs = (node.attributes = new NamedNodeMap());
		attrs._ownerElement = node;
		return node;
	},
	/**
	 * @returns {DocumentFragment}
	 */
	createDocumentFragment: function () {
		var node = new DocumentFragment(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		return node;
	},
	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	createTextNode: function (data) {
		var node = new Text(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.appendData(data);
		return node;
	},
	/**
	 * @param {string} data
	 * @returns {Comment}
	 * @see https://dom.spec.whatwg.org/#dom-document-createcomment
	 * @see https://www.w3.org/TR/xml/#NT-Comment XML 1.0 production [15]
	 * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.3
	 *
	 *      Note: no validation is performed at creation time. When the resulting document is
	 *      serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
	 *      if the comment data contains `--` anywhere, ends with `-`, or contains characters
	 *      outside the XML Char production (W3C DOM Parsing §3.2.1.3). Without that option the
	 *      data is emitted verbatim.
	 */
	createComment: function (data) {
		var node = new Comment(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.appendData(data);
		return node;
	},
	/**
	 * Returns a new CDATASection node whose data is `data`.
	 *
	 * __This implementation differs from the specification:__ - calling this method on an HTML
	 * document does not throw `NotSupportedError`.
	 *
	 * @param {string} data
	 * @returns {CDATASection}
	 * @throws {DOMException}
	 * With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
	 * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
	 */
	createCDATASection: function (data) {
		if (data.indexOf(']]>') !== -1) {
			throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'data contains "]]>"');
		}
		var node = new CDATASection(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.appendData(data);
		return node;
	},
	/**
	 * Returns a ProcessingInstruction node whose target is target and data is data.
	 *
	 * __This behavior is slightly different from the in the specs__:
	 * - it does not do any input validation on the arguments and doesn't throw
	 * "InvalidCharacterError".
	 *
	 * Note: When the resulting document is serialized with `requireWellFormed: true`, the
	 * serializer throws `InvalidStateError` if `.target` is not a valid XML `NCName` (a `Name`
	 * with no colon) or is an ASCII case-insensitive match for `"xml"`, or if `.data` contains
	 * `?>` or characters outside the XML Char production (W3C DOM Parsing §3.2.1.7). Without that
	 * option the target and data are emitted verbatim.
	 *
	 * @param {string} target
	 * @param {string} data
	 * @returns {ProcessingInstruction}
	 * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
	 * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
	 * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
	 */
	createProcessingInstruction: function (target, data) {
		var node = new ProcessingInstruction(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.nodeName = node.target = target;
		node.nodeValue = node.data = data;
		return node;
	},
	/**
	 * Creates an `Attr` node that is owned by this document.
	 * In HTML Documents `localName` is the lower cased `name`,
	 * otherwise no transformation is being applied.
	 *
	 * __This implementation differs from the specification:__ - The provided name is not checked
	 * against the `Name` production,
	 * so no related error will be thrown.
	 *
	 * @param {string} name
	 * @returns {Attr}
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createAttribute
	 * @see https://dom.spec.whatwg.org/#dom-document-createattribute
	 */
	createAttribute: function (name) {
		if (!g.QName_exact.test(name)) {
			throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in name "' + name + '"');
		}
		if (this.type === 'html') {
			name = name.toLowerCase();
		}
		return this._createAttribute(name);
	},
	_createAttribute: function (name) {
		var node = new Attr(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.name = name;
		node.nodeName = name;
		node.localName = name;
		node.specified = true;
		return node;
	},
	/**
	 * Creates an EntityReference object.
	 * The current implementation does not fill the `childNodes` with those of the corresponding
	 * `Entity`
	 *
	 * The `name` is validated against the XML `Name` production at creation time; an invalid name
	 * throws `InvalidCharacterError`. When the resulting node is serialized with
	 * `requireWellFormed: true`, the serializer re-validates `nodeName` against the XML `Name`
	 * production and throws `InvalidStateError` if a later `nodeName` mutation made it invalid;
	 * without that option the name is emitted verbatim.
	 *
	 * __This implementation differs from the specification:__ xmldom does not expand entities —
	 * the parser resolves entity references inline and never constructs `EntityReference` nodes,
	 * so this method is the only producer.
	 *
	 * @deprecated
	 * In DOM Level 4.
	 * @param {string} name
	 * The name of the entity to reference. No namespace well-formedness checks are performed.
	 * @returns {EntityReference}
	 * @throws {DOMException}
	 * With code `INVALID_CHARACTER_ERR` when `name` is not a valid XML `Name`.
	 * @throws {DOMException}
	 * with code `NOT_SUPPORTED_ERR` when the document is of type `html`
	 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE
	 */
	createEntityReference: function (name) {
		if (!g.Name_exact.test(name)) {
			throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'not a valid xml name "' + name + '"');
		}
		if (this.type === 'html') {
			throw new DOMException('document is an html document', DOMExceptionName.NotSupportedError);
		}

		var node = new EntityReference(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.nodeName = name;
		return node;
	},
	// Introduced in DOM Level 2:
	/**
	 * @param {string} namespaceURI
	 * @param {string} qualifiedName
	 * @returns {Element}
	 */
	createElementNS: function (namespaceURI, qualifiedName) {
		var validated = validateAndExtract(namespaceURI, qualifiedName);
		var node = new Element(PDC);
		var attrs = (node.attributes = new NamedNodeMap());
		node.childNodes = new NodeList();
		node.ownerDocument = this;
		node.nodeName = qualifiedName;
		node.tagName = qualifiedName;
		node.namespaceURI = validated[0];
		node.prefix = validated[1];
		node.localName = validated[2];
		attrs._ownerElement = node;
		return node;
	},
	// Introduced in DOM Level 2:
	/**
	 * @param {string} namespaceURI
	 * @param {string} qualifiedName
	 * @returns {Attr}
	 */
	createAttributeNS: function (namespaceURI, qualifiedName) {
		var validated = validateAndExtract(namespaceURI, qualifiedName);
		var node = new Attr(PDC);
		node.ownerDocument = this;
		node.childNodes = new NodeList();
		node.nodeName = qualifiedName;
		node.name = qualifiedName;
		node.specified = true;
		node.namespaceURI = validated[0];
		node.prefix = validated[1];
		node.localName = validated[2];
		return node;
	},
};
_extends(Document, Node);

function Element(symbol) {
	checkSymbol(symbol);

	this._nsMap = Object.create(null);
}
Element.prototype = {
	nodeType: ELEMENT_NODE,
	/**
	 * The attributes of this element.
	 *
	 * @type {NamedNodeMap | null}
	 */
	attributes: null,
	getQualifiedName: function () {
		return this.prefix ? this.prefix + ':' + this.localName : this.localName;
	},
	_isInHTMLDocumentAndNamespace: function () {
		return this.ownerDocument.type === 'html' && this.namespaceURI === NAMESPACE.HTML;
	},
	/**
	 * Implementaton of Level2 Core function hasAttributes.
	 *
	 * @returns {boolean}
	 * True if attribute list is not empty.
	 * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-NodeHasAttrs
	 */
	hasAttributes: function () {
		return !!(this.attributes && this.attributes.length);
	},
	hasAttribute: function (name) {
		return !!this.getAttributeNode(name);
	},
	/**
	 * Returns element’s first attribute whose qualified name is `name`, and `null`
	 * if there is no such attribute.
	 *
	 * @param {string} name
	 * @returns {string | null}
	 */
	getAttribute: function (name) {
		var attr = this.getAttributeNode(name);
		return attr ? attr.value : null;
	},
	getAttributeNode: function (name) {
		if (this._isInHTMLDocumentAndNamespace()) {
			name = name.toLowerCase();
		}
		return this.attributes.getNamedItem(name);
	},
	/**
	 * Sets the value of element’s first attribute whose qualified name is qualifiedName to value.
	 *
	 * @param {string} name
	 * @param {string} value
	 */
	setAttribute: function (name, value) {
		if (this._isInHTMLDocumentAndNamespace()) {
			name = name.toLowerCase();
		}
		var attr = this.getAttributeNode(name);
		if (attr) {
			attr.value = attr.nodeValue = '' + value;
		} else {
			attr = this.ownerDocument._createAttribute(name);
			attr.value = attr.nodeValue = '' + value;
			this.setAttributeNode(attr);
		}
	},
	removeAttribute: function (name) {
		var attr = this.getAttributeNode(name);
		attr && this.removeAttributeNode(attr);
	},
	setAttributeNode: function (newAttr) {
		return this.attributes.setNamedItem(newAttr);
	},
	setAttributeNodeNS: function (newAttr) {
		return this.attributes.setNamedItemNS(newAttr);
	},
	removeAttributeNode: function (oldAttr) {
		//console.log(this == oldAttr.ownerElement)
		return this.attributes.removeNamedItem(oldAttr.nodeName);
	},
	//get real attribute name,and remove it by removeAttributeNode
	removeAttributeNS: function (namespaceURI, localName) {
		var old = this.getAttributeNodeNS(namespaceURI, localName);
		old && this.removeAttributeNode(old);
	},

	hasAttributeNS: function (namespaceURI, localName) {
		return this.getAttributeNodeNS(namespaceURI, localName) != null;
	},
	/**
	 * Returns element’s attribute whose namespace is `namespaceURI` and local name is
	 * `localName`,
	 * or `null` if there is no such attribute.
	 *
	 * @param {string} namespaceURI
	 * @param {string} localName
	 * @returns {string | null}
	 */
	getAttributeNS: function (namespaceURI, localName) {
		var attr = this.getAttributeNodeNS(namespaceURI, localName);
		return attr ? attr.value : null;
	},
	/**
	 * Sets the value of element’s attribute whose namespace is `namespaceURI` and local name is
	 * `localName` to value.
	 *
	 * @param {string} namespaceURI
	 * @param {string} qualifiedName
	 * @param {string} value
	 * @see https://dom.spec.whatwg.org/#dom-element-setattributens
	 */
	setAttributeNS: function (namespaceURI, qualifiedName, value) {
		var validated = validateAndExtract(namespaceURI, qualifiedName);
		var localName = validated[2];
		var attr = this.getAttributeNodeNS(namespaceURI, localName);
		if (attr) {
			attr.value = attr.nodeValue = '' + value;
		} else {
			attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
			attr.value = attr.nodeValue = '' + value;
			this.setAttributeNode(attr);
		}
	},
	getAttributeNodeNS: function (namespaceURI, localName) {
		return this.attributes.getNamedItemNS(namespaceURI, localName);
	},

	/**
	 * Returns a LiveNodeList of all child elements which have **all** of the given class name(s).
	 *
	 * Returns an empty list if `classNames` is an empty string or only contains HTML white space
	 * characters.
	 *
	 * Warning: This returns a live LiveNodeList.
	 * Changes in the DOM will reflect in the array as the changes occur.
	 * If an element selected by this array no longer qualifies for the selector,
	 * it will automatically be removed. Be aware of this for iteration purposes.
	 *
	 * @param {string} classNames
	 * Is a string representing the class name(s) to match; multiple class names are separated by
	 * (ASCII-)whitespace.
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
	 * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
	 */
	getElementsByClassName: function (classNames) {
		var classNamesSet = toOrderedSet(classNames);
		return new LiveNodeList(this, function (base) {
			var ls = [];
			if (classNamesSet.length > 0) {
				_visitNode(base, function (node) {
					if (node !== base && node.nodeType === ELEMENT_NODE) {
						var nodeClassNames = node.getAttribute('class');
						// can be null if the attribute does not exist
						if (nodeClassNames) {
							// before splitting and iterating just compare them for the most common case
							var matches = classNames === nodeClassNames;
							if (!matches) {
								var nodeClassNamesSet = toOrderedSet(nodeClassNames);
								matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
							}
							if (matches) {
								ls.push(node);
							}
						}
					}
				});
			}
			return ls;
		});
	},

	/**
	 * Returns a LiveNodeList of elements with the given qualifiedName.
	 * Searching for all descendants can be done by passing `*` as `qualifiedName`.
	 *
	 * All descendants of the specified element are searched, but not the element itself.
	 * The returned list is live, which means it updates itself with the DOM tree automatically.
	 * Therefore, there is no need to call `Element.getElementsByTagName()`
	 * with the same element and arguments repeatedly if the DOM changes in between calls.
	 *
	 * When called on an HTML element in an HTML document,
	 * `getElementsByTagName` lower-cases the argument before searching for it.
	 * This is undesirable when trying to match camel-cased SVG elements (such as
	 * `<linearGradient>`) in an HTML document.
	 * Instead, use `Element.getElementsByTagNameNS()`,
	 * which preserves the capitalization of the tag name.
	 *
	 * `Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
	 * except that it only searches for elements that are descendants of the specified element.
	 *
	 * @param {string} qualifiedName
	 * @returns {LiveNodeList}
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
	 * @see https://dom.spec.whatwg.org/#concept-getelementsbytagname
	 */
	getElementsByTagName: function (qualifiedName) {
		var isHTMLDocument = (this.nodeType === DOCUMENT_NODE ? this : this.ownerDocument).type === 'html';
		var lowerQualifiedName = qualifiedName.toLowerCase();
		return new LiveNodeList(this, function (base) {
			var ls = [];
			_visitNode(base, function (node) {
				if (node === base || node.nodeType !== ELEMENT_NODE) {
					return;
				}
				if (qualifiedName === '*') {
					ls.push(node);
				} else {
					var nodeQualifiedName = node.getQualifiedName();
					var matchingQName = isHTMLDocument && node.namespaceURI === NAMESPACE.HTML ? lowerQualifiedName : qualifiedName;
					if (nodeQualifiedName === matchingQName) {
						ls.push(node);
					}
				}
			});
			return ls;
		});
	},
	getElementsByTagNameNS: function (namespaceURI, localName) {
		return new LiveNodeList(this, function (base) {
			var ls = [];
			_visitNode(base, function (node) {
				if (
					node !== base &&
					node.nodeType === ELEMENT_NODE &&
					(namespaceURI === '*' || node.namespaceURI === namespaceURI) &&
					(localName === '*' || node.localName == localName)
				) {
					ls.push(node);
				}
			});
			return ls;
		});
	},
};
Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;

_extends(Element, Node);
function Attr(symbol) {
	checkSymbol(symbol);

	this.namespaceURI = null;
	this.prefix = null;
	this.ownerElement = null;
}
Attr.prototype.nodeType = ATTRIBUTE_NODE;
_extends(Attr, Node);

function CharacterData(symbol) {
	checkSymbol(symbol);
}
CharacterData.prototype = {
	data: '',
	substringData: function (offset, count) {
		return this.data.substring(offset, offset + count);
	},
	appendData: function (text) {
		text = this.data + text;
		this.nodeValue = this.data = text;
		this.length = text.length;
	},
	insertData: function (offset, text) {
		this.replaceData(offset, 0, text);
	},
	deleteData: function (offset, count) {
		this.replaceData(offset, count, '');
	},
	replaceData: function (offset, count, text) {
		var start = this.data.substring(0, offset);
		var end = this.data.substring(offset + count);
		text = start + text + end;
		this.nodeValue = this.data = text;
		this.length = text.length;
	},
};
_extends(CharacterData, Node);
function Text(symbol) {
	checkSymbol(symbol);
}
Text.prototype = {
	nodeName: '#text',
	nodeType: TEXT_NODE,
	splitText: function (offset) {
		var text = this.data;
		var newText = text.substring(offset);
		text = text.substring(0, offset);
		this.data = this.nodeValue = text;
		this.length = text.length;
		var newNode = this.ownerDocument.createTextNode(newText);
		if (this.parentNode) {
			this.parentNode.insertBefore(newNode, this.nextSibling);
		}
		return newNode;
	},
};
_extends(Text, CharacterData);
function Comment(symbol) {
	checkSymbol(symbol);
}
Comment.prototype = {
	nodeName: '#comment',
	nodeType: COMMENT_NODE,
};
_extends(Comment, CharacterData);

function CDATASection(symbol) {
	checkSymbol(symbol);
}
CDATASection.prototype = {
	nodeName: '#cdata-section',
	nodeType: CDATA_SECTION_NODE,
};
_extends(CDATASection, Text);

/**
 * @class DocumentType
 * @augments Node
 * @property {string} name
 * The doctype name, stored verbatim. Declared `readonly` by the WHATWG DOM spec; xmldom does
 * not enforce this constraint — direct property writes succeed and the written value is
 * serialized verbatim. When serialized with `requireWellFormed: true`, the serializer
 * validates the value against the XML `Name` production and throws `InvalidStateError` if it
 * does not match.
 * @property {string} publicId
 * The external subset public identifier, stored verbatim (including surrounding quotes).
 * Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this constraint —
 * direct property writes succeed and the written value is serialized verbatim.
 * When serialized with `requireWellFormed: true`, the serializer validates the value against
 * the XML `PubidLiteral` production and throws `InvalidStateError` if it does not match.
 * @property {string} systemId
 * The external subset system identifier, stored verbatim (including surrounding quotes).
 * Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this constraint —
 * direct property writes succeed and the written value is serialized verbatim.
 * When serialized with `requireWellFormed: true`, the serializer validates the value against
 * the XML `SystemLiteral` production and throws `InvalidStateError` if it does not match.
 * @property {string} internalSubset
 * The internal subset string (the raw content between `[` and `]`), or an empty string.
 * Declared `readonly` by the WHATWG DOM spec; xmldom does not enforce this constraint —
 * direct property writes succeed and the written value is serialized verbatim.
 * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
 * if the value contains `"]>"`.
 * @see https://developer.mozilla.org/docs/Web/API/DocumentType MDN
 * @see https://dom.spec.whatwg.org/#interface-documenttype WHATWG DOM
 * @prettierignore
 */
function DocumentType(symbol) {
	checkSymbol(symbol);
}
DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
_extends(DocumentType, Node);

function Notation(symbol) {
	checkSymbol(symbol);
}
Notation.prototype.nodeType = NOTATION_NODE;
_extends(Notation, Node);

function Entity(symbol) {
	checkSymbol(symbol);
}
Entity.prototype.nodeType = ENTITY_NODE;
_extends(Entity, Node);

/**
 * Represents an EntityReference node, serialized as `&nodeName;`.
 *
 * `nodeName` is the referenced entity's name, stored verbatim. When serialized with
 * `requireWellFormed: true`, the serializer validates `nodeName` against the XML `Name`
 * production and throws `InvalidStateError` if it does not match; without that option the name
 * is emitted verbatim between `&` and `;`.
 *
 * __This implementation differs from the specification:__ xmldom does not expand entities —
 * the parser resolves entity references inline and never constructs `EntityReference` nodes,
 * so the only producer is {@link Document#createEntityReference}.
 *
 * @class
 * @see https://www.w3.org/TR/xml/#NT-Name
 */
function EntityReference(symbol) {
	checkSymbol(symbol);
}
EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
_extends(EntityReference, Node);

function DocumentFragment(symbol) {
	checkSymbol(symbol);
}
DocumentFragment.prototype.nodeName = '#document-fragment';
DocumentFragment.prototype.nodeType = DOCUMENT_FRAGMENT_NODE;
_extends(DocumentFragment, Node);

function ProcessingInstruction(symbol) {
	checkSymbol(symbol);
}
ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
_extends(ProcessingInstruction, CharacterData);
function XMLSerializer() {}
/**
 * Returns the result of serializing `node` to XML.
 *
 * When `options.requireWellFormed` is `true`, the serializer throws `InvalidStateError` for
 * content that would produce ill-formed XML (e.g. CDATASection data containing `"]]>"`, Text
 * data containing characters outside the XML Char production, or a Document with no
 * `documentElement`).
 *
 * When `options.splitCDATASections` is `false`, CDATASection data is emitted verbatim even
 * when it contains `"]]>"`. When `true` (the default), `"]]>"` sequences are split across
 * concatenated CDATA sections — this behavior is **deprecated** and will be removed in the
 * next breaking release. Callers should migrate to `{ requireWellFormed: true }`, which throws
 * `InvalidStateError` instead of transforming.
 *
 * __This implementation differs from the specification:__ - CDATASection serialization is not
 * specified by W3C DOM Parsing or WHATWG DOM Parsing (see
 * {@link https://github.com/w3c/DOM-Parsing/issues/38 w3c/DOM-Parsing#38}).
 * When `splitCDATASections` is `true` (the default), `"]]>"` sequences in CDATASection data
 * are split across concatenated CDATA sections — this mechanism is derived from DOM Level 3
 * Core and is **deprecated**. The split mechanics will be removed in the next breaking
 * release. Callers that rely on this behavior should migrate to `{ requireWellFormed: true }`.
 * - W3C DOM Parsing §3.2.1.1 requires well-formedness checks on Element `localName`s,
 * prefixes,
 * and attribute serialization (duplicate attributes, namespace declarations, attribute value
 * characters) when `requireWellFormed` is `true`. Element and attribute qualified names (which
 * cover the namespace prefix) are validated against the XML `QName` production; the remaining
 * §3.2.1.1 checks (duplicate attributes, namespace-declaration consistency) and creation-time
 * name validation are **not implemented** in this release — see the tracking issue filed
 * against the next breaking milestone.
 *
 * @param {Node} node
 * @param {Object | function} [options]
 * Options object, or a legacy nodeFilter function (backward compatible).
 * @param {boolean} [options.requireWellFormed=false]
 * When `true`, throws `InvalidStateError` for content that would produce ill-formed XML.
 * @param {boolean} [options.splitCDATASections=true]
 * When `true` (default), splits `"]]>"` sequences in CDATASection data across concatenated
 * CDATA sections. **Deprecated** — will be removed in the next breaking release.
 * @param {function} [options.nodeFilter]
 * A filter function applied to each node before serialization.
 * @returns {string}
 * @throws {DOMException}
 * With name `InvalidStateError` when `requireWellFormed` is `true` and any of the following
 * conditions hold:
 * - an Element's qualified name (including any namespace prefix) is not a valid XML QName
 * - an attribute's qualified name (including a synthesized `xmlns:` namespace declaration) is
 * not a valid XML QName
 * - CDATASection data contains `"]]>"`
 * - Text data contains characters outside the XML Char production
 * - a Comment node's data contains `--` anywhere or ends with `-`
 * - a ProcessingInstruction's target is not a valid XML `NCName` (a `Name` with no colon) or is
 * an ASCII case-insensitive match for `"xml"`, or its data contains `?>` or characters outside
 * the XML Char production
 * - a DocumentType's `name` is not a valid XML `Name` (XML 1.0 production [5])
 * - a DocumentType's `publicId` is non-empty and does not match the XML `PubidLiteral`
 * production (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12])
 * - a DocumentType's `systemId` is non-empty and does not match the XML `SystemLiteral`
 * production (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11])
 * - a DocumentType's `internalSubset` contains `"]>"`
 * - an EntityReference's `nodeName` is not a valid XML `Name` (XML 1.0 production [5])
 * - the Document has no `documentElement`
 * @see https://developer.mozilla.org/docs/Web/API/XMLSerializer/serializeToString
 * @see https://html.spec.whatwg.org/#dom-xmlserializer-serializetostring
 * @see https://github.com/w3c/DOM-Parsing/issues/84
 * @prettierignore
 */
XMLSerializer.prototype.serializeToString = function (node, options) {
	return nodeSerializeToString.call(node, options);
};
Node.prototype.toString = nodeSerializeToString;
function nodeSerializeToString(options) {
	// Normalize the user-supplied options into a single internal opts object so that the
	// internal serializer always works with a consistent shape rather than positional flags.
	var opts;
	if (typeof options === 'function') {
		opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
	} else if (options != null) {
		opts = {
			requireWellFormed: !!options.requireWellFormed,
			splitCDATASections: options.splitCDATASections !== false,
			nodeFilter: options.nodeFilter || null,
		};
	} else {
		opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
	}
	var buf = [];
	var refNode = (this.nodeType === DOCUMENT_NODE && this.documentElement) || this;
	var prefix = refNode.prefix;
	var uri = refNode.namespaceURI;

	if (uri && prefix == null) {
		var prefix = refNode.lookupPrefix(uri);
		if (prefix == null) {
			var visibleNamespaces = [
				{ namespace: uri, prefix: null },
				//{namespace:uri,prefix:''}
			];
		}
	}
	serializeToString(this, buf, visibleNamespaces, opts);
	return buf.join('');
}

function needNamespaceDefine(node, isHTML, visibleNamespaces) {
	var prefix = node.prefix || '';
	var uri = node.namespaceURI;
	// According to [Namespaces in XML 1.0](https://www.w3.org/TR/REC-xml-names/#ns-using) ,
	// and more specifically https://www.w3.org/TR/REC-xml-names/#nsc-NoPrefixUndecl :
	// > In a namespace declaration for a prefix [...], the attribute value MUST NOT be empty.
	// in a similar manner [Namespaces in XML 1.1](https://www.w3.org/TR/xml-names11/#ns-using)
	// and more specifically https://www.w3.org/TR/xml-names11/#nsc-NSDeclared :
	// > [...] Furthermore, the attribute value [...] must not be an empty string.
	// so serializing empty namespace value like xmlns:ds="" would produce an invalid XML document.
	if (!uri) {
		return false;
	}
	if ((prefix === 'xml' && uri === NAMESPACE.XML) || uri === NAMESPACE.XMLNS) {
		return false;
	}

	var i = visibleNamespaces.length;
	while (i--) {
		var ns = visibleNamespaces[i];
		// get namespace prefix
		if (ns.prefix === prefix) {
			return ns.namespace !== uri;
		}
	}
	return true;
}
/**
 * Literal whitespace other than space that appear in attribute values are serialized as
 * their entity references, so they will be preserved.
 * (In contrast to whitespace literals in the input which are normalized to spaces).
 *
 * Well-formed constraint: No < in Attribute Values:
 * > The replacement text of any entity referred to directly or indirectly
 * > in an attribute value must not contain a <.
 *
 * @see https://www.w3.org/TR/xml11/#CleanAttrVals
 * @see https://www.w3.org/TR/xml11/#NT-AttValue
 * @see https://www.w3.org/TR/xml11/#AVNormalize
 * @see https://w3c.github.io/DOM-Parsing/#serializing-an-element-s-attributes
 * @prettierignore
 */
function addSerializedAttribute(buf, qualifiedName, value, requireWellFormed) {
	if (requireWellFormed && !g.QName_exact.test(qualifiedName)) {
		throw new DOMException(
			'The attribute name "' + qualifiedName + '" is not a valid XML QName',
			DOMExceptionName.InvalidStateError
		);
	}
	buf.push(' ', qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
}

function serializeToString(node, buf, visibleNamespaces, opts) {
	if (!visibleNamespaces) {
		visibleNamespaces = [];
	}
	var nodeFilter = opts.nodeFilter;
	var requireWellFormed = opts.requireWellFormed;
	var splitCDATASections = opts.splitCDATASections;
	var doc = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
	var isHTML = doc.type === 'html';

	walkDOM(
		node,
		{ ns: visibleNamespaces },
		{
			enter: function (n, ctx) {
				var namespaces = ctx.ns;

				if (nodeFilter) {
					n = nodeFilter(n);
					if (n) {
						if (typeof n == 'string') {
							buf.push(n);
							return null;
						}
					} else {
						return null;
					}
				}

				switch (n.nodeType) {
					case ELEMENT_NODE:
						var attrs = n.attributes;
						var len = attrs.length;
						var nodeName = n.tagName;

						var prefixedNodeName = nodeName;
						if (!isHTML && !n.prefix && n.namespaceURI) {
							var defaultNS;
							// lookup current default ns from `xmlns` attribute
							for (var ai = 0; ai < attrs.length; ai++) {
								if (attrs.item(ai).name === 'xmlns') {
									defaultNS = attrs.item(ai).value;
									break;
								}
							}
							if (!defaultNS) {
								// lookup current default ns in visibleNamespaces
								for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
									var nsEntry = namespaces[nsi];
									if (nsEntry.prefix === '' && nsEntry.namespace === n.namespaceURI) {
										defaultNS = nsEntry.namespace;
										break;
									}
								}
							}
							if (defaultNS !== n.namespaceURI) {
								for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
									var nsEntry = namespaces[nsi];
									if (nsEntry.namespace === n.namespaceURI) {
										if (nsEntry.prefix) {
											prefixedNodeName = nsEntry.prefix + ':' + nodeName;
										}
										break;
									}
								}
							}
						}

						if (requireWellFormed && !g.QName_exact.test(prefixedNodeName)) {
							throw new DOMException(
								'The element name "' + prefixedNodeName + '" is not a valid XML QName',
								DOMExceptionName.InvalidStateError
							);
						}

						buf.push('<', prefixedNodeName);

						// Build a fresh namespace snapshot for this element's children.
						// The slice prevents sibling elements from inheriting each other's declarations.
						var childNamespaces = namespaces.slice();

						for (var i = 0; i < len; i++) {
							// add namespaces for attributes
							var attr = attrs.item(i);
							if (attr.prefix == 'xmlns') {
								childNamespaces.push({
									prefix: attr.localName,
									namespace: attr.value,
								});
							} else if (attr.nodeName == 'xmlns') {
								childNamespaces.push({ prefix: '', namespace: attr.value });
							}
						}

						for (var i = 0; i < len; i++) {
							var attr = attrs.item(i);
							if (needNamespaceDefine(attr, isHTML, childNamespaces)) {
								var attrPrefix = attr.prefix || '';
								var uri = attr.namespaceURI;
								addSerializedAttribute(buf, attrPrefix ? 'xmlns:' + attrPrefix : 'xmlns', uri, requireWellFormed);
								childNamespaces.push({ prefix: attrPrefix, namespace: uri });
							}
							// Apply nodeFilter and serialize the attribute.
							var filteredAttr = nodeFilter ? nodeFilter(attr) : attr;
							if (filteredAttr) {
								if (typeof filteredAttr === 'string') {
									buf.push(filteredAttr);
								} else {
									addSerializedAttribute(buf, filteredAttr.name, filteredAttr.value, requireWellFormed);
								}
							}
						}

						// add namespace for current node
						if (nodeName === prefixedNodeName && needNamespaceDefine(n, isHTML, childNamespaces)) {
							var nodePrefix = n.prefix || '';
							var uri = n.namespaceURI;
							addSerializedAttribute(buf, nodePrefix ? 'xmlns:' + nodePrefix : 'xmlns', uri, requireWellFormed);
							childNamespaces.push({ prefix: nodePrefix, namespace: uri });
						}

						// in XML elements can be closed when they have no children
						var canCloseTag = !n.firstChild;
						if (canCloseTag && (isHTML || n.namespaceURI === NAMESPACE.HTML)) {
							// in HTML (doc or ns) only void elements can be closed right away
							canCloseTag = isHTMLVoidElement(nodeName);
						}
						if (canCloseTag) {
							buf.push('/>');
							// Self-closing: no children and no closing tag needed from exit.
							return null;
						}

						buf.push('>');

						// HTML raw text elements: serialize children as raw data without further descent.
						if (isHTML && isHTMLRawTextElement(nodeName)) {
							var child = n.firstChild;
							while (child) {
								if (child.data) {
									buf.push(child.data);
								} else {
									serializeToString(child, buf, childNamespaces.slice(), opts);
								}
								child = child.nextSibling;
							}
							buf.push('</', prefixedNodeName, '>');
							// Children handled manually above; prevent walkDOM from also traversing them.
							return null;
						}

						// Return child context so walkDOM descends; exit will emit the closing tag.
						return { ns: childNamespaces, tag: prefixedNodeName };
					case DOCUMENT_NODE:
					case DOCUMENT_FRAGMENT_NODE:
						if (requireWellFormed && n.nodeType === DOCUMENT_NODE && n.documentElement == null) {
							throw new DOMException('The Document has no documentElement', DOMExceptionName.InvalidStateError);
						}
						// Pass namespaces through; each child element will slice independently.
						return { ns: namespaces };
					case ATTRIBUTE_NODE:
						addSerializedAttribute(buf, n.name, n.value, requireWellFormed);
						return null;
					case TEXT_NODE:
						/*
						 * The ampersand character (&) and the left angle bracket (<) must not appear in their literal form,
						 * except when used as markup delimiters, or within a comment, a processing instruction,
						 * or a CDATA section.
						 * If they are needed elsewhere, they must be escaped using either numeric character
						 * references or the strings `&amp;` and `&lt;` respectively.
						 * The right angle bracket (>) may be represented using the string " &gt; ",
						 * and must, for compatibility, be escaped using either `&gt;`,
						 * or a character reference when it appears in the string `]]>` in content,
						 * when that string is not marking the end of a CDATA section.
						 *
						 * In the content of elements, character data is any string of characters which does not
						 * contain the start-delimiter of any markup and does not include the CDATA-section-close
						 * delimiter, `]]>`.
						 *
						 * @see https://www.w3.org/TR/xml/#NT-CharData
						 * @see https://w3c.github.io/DOM-Parsing/#xml-serializing-a-text-node
						 */
						if (requireWellFormed && g.InvalidChar.test(n.data)) {
							throw new DOMException(
								'The Text node data contains characters outside the XML Char production',
								DOMExceptionName.InvalidStateError
							);
						}
						buf.push(n.data.replace(/[<&>]/g, _xmlEncoder));
						return null;
					case CDATA_SECTION_NODE:
						if (requireWellFormed && n.data.indexOf(']]>') !== -1) {
							throw new DOMException('The CDATASection data contains "]]>"', DOMExceptionName.InvalidStateError);
						}
						if (splitCDATASections) {
							buf.push(g.CDATA_START, n.data.replace(/]]>/g, ']]]]><![CDATA[>'), g.CDATA_END);
						} else {
							buf.push(g.CDATA_START, n.data, g.CDATA_END);
						}
						return null;
					case COMMENT_NODE:
						if (requireWellFormed) {
							if (g.InvalidChar.test(n.data)) {
								throw new DOMException(
									'The comment node data contains characters outside the XML Char production',
									DOMExceptionName.InvalidStateError
								);
							}
							if (n.data.indexOf('--') !== -1 || n.data[n.data.length - 1] === '-') {
								throw new DOMException(
									'The comment node data contains "--" or ends with "-"',
									DOMExceptionName.InvalidStateError
								);
							}
						}
						buf.push(g.COMMENT_START, n.data, g.COMMENT_END);
						return null;
					case DOCUMENT_TYPE_NODE:
						var pubid = n.publicId;
						var sysid = n.systemId;
						if (requireWellFormed) {
							if (!g.Name_exact.test(n.name)) {
								throw new DOMException(
									'The doctype name "' + n.name + '" is not a valid XML Name',
									DOMExceptionName.InvalidStateError
								);
							}
							if (pubid && !g.PubidLiteral_match.test(pubid)) {
								throw new DOMException('DocumentType publicId is not a valid PubidLiteral', DOMExceptionName.InvalidStateError);
							}
							if (sysid && sysid !== '.' && !g.SystemLiteral_match.test(sysid)) {
								throw new DOMException('DocumentType systemId is not a valid SystemLiteral', DOMExceptionName.InvalidStateError);
							}
							if (n.internalSubset && n.internalSubset.indexOf(']>') !== -1) {
								throw new DOMException('DocumentType internalSubset contains "]>"', DOMExceptionName.InvalidStateError);
							}
						}
						buf.push(g.DOCTYPE_DECL_START, ' ', n.name);
						if (pubid) {
							buf.push(' ', g.PUBLIC, ' ', pubid);
							if (sysid && sysid !== '.') {
								buf.push(' ', sysid);
							}
						} else if (sysid && sysid !== '.') {
							buf.push(' ', g.SYSTEM, ' ', sysid);
						}
						if (n.internalSubset) {
							buf.push(' [', n.internalSubset, ']');
						}
						buf.push('>');
						return null;
					case PROCESSING_INSTRUCTION_NODE:
						if (requireWellFormed) {
							if (!g.NCName_exact.test(n.target) || n.target.toLowerCase() === 'xml') {
								throw new DOMException(
									'The processing instruction target "' + n.target + '" is not a valid XML NCName or is reserved',
									DOMExceptionName.InvalidStateError
								);
							}
							if (g.InvalidChar.test(n.data)) {
								throw new DOMException(
									'The ProcessingInstruction data contains characters outside the XML Char production',
									DOMExceptionName.InvalidStateError
								);
							}
							if (n.data.indexOf('?>') !== -1) {
								throw new DOMException('The ProcessingInstruction data contains "?>"', DOMExceptionName.InvalidStateError);
							}
						}
						buf.push('<?', n.target, ' ', n.data, '?>');
						return null;
					case ENTITY_REFERENCE_NODE:
						if (requireWellFormed && !g.Name_exact.test(n.nodeName)) {
							throw new DOMException(
								'The entity reference name "' + n.nodeName + '" is not a valid XML Name',
								DOMExceptionName.InvalidStateError
							);
						}
						buf.push('&', n.nodeName, ';');
						return null;
					//case ENTITY_NODE:
					//case NOTATION_NODE:
					default:
						buf.push('??', n.nodeName);
						return null;
				}
			},
			exit: function (n, childCtx) {
				// Emit the closing tag for elements that were opened (not self-closed, not raw text).
				if (childCtx && childCtx.tag) {
					buf.push('</', childCtx.tag, '>');
				}
			},
		}
	);
}
/**
 * Imports a node from a different document into `doc`, creating a new copy.
 * Delegates to {@link walkDOM} for traversal. Each node in the subtree is shallow-cloned,
 * stamped with `doc` as its `ownerDocument`, and detached (`parentNode` set to `null`).
 * Children are imported recursively when `deep` is `true`; for {@link Attr} nodes `deep` is
 * always forced to `true`
 * because an attribute's value lives in a child text node.
 *
 * @param {Document} doc
 * The document that will own the imported node.
 * @param {Node} node
 * The node to import.
 * @param {boolean} deep
 * If `true`, descendants are imported recursively.
 * @returns {Node}
 * The newly imported node, now owned by `doc`.
 */
function importNode(doc, node, deep) {
	var destRoot;
	walkDOM(node, null, {
		enter: function (srcNode, destParent) {
			// Shallow-clone the node and stamp it into the target document.
			var destNode = srcNode.cloneNode(false);
			destNode.ownerDocument = doc;
			destNode.parentNode = null;
			// capture as the root of the imported subtree or attach to parent.
			if (destParent === null) {
				destRoot = destNode;
			} else {
				destParent.appendChild(destNode);
			}
			// ATTRIBUTE_NODE must always be imported deeply: its value lives in a child text node.
			var shouldDeep = srcNode.nodeType === ATTRIBUTE_NODE || deep;
			return shouldDeep ? destNode : null;
		},
	});
	return destRoot;
}

/**
 * Creates a copy of a node from an existing one.
 *
 * @param {Document} doc
 * The Document object representing the document that the new node will belong to.
 * @param {Node} node
 * The node to clone.
 * @param {boolean} deep
 * If true, the contents of the node are recursively copied.
 * If false, only the node itself (and its attributes, if it is an element) are copied.
 * @returns {Node}
 * Returns the newly created copy of the node.
 * @throws {DOMException}
 * May throw a DOMException if operations within setAttributeNode or appendChild (which are
 * potentially invoked in this function) do not meet their specific constraints.
 */
function cloneNode(doc, node, deep) {
	var destRoot;
	walkDOM(node, null, {
		enter: function (srcNode, destParent) {
			// 1. Create a blank node of the same type and copy all scalar own properties.
			var destNode = new srcNode.constructor(PDC);
			for (var n in srcNode) {
				if (hasOwn(srcNode, n)) {
					var v = srcNode[n];
					if (typeof v != 'object') {
						if (v != destNode[n]) {
							destNode[n] = v;
						}
					}
				}
			}
			if (srcNode.childNodes) {
				destNode.childNodes = new NodeList();
			}
			destNode.ownerDocument = doc;
			// 2. Handle node-type-specific setup.
			//    Attributes are not DOM children, so they are cloned inline here
			//    rather than by walkDOM descent.
			//    ATTRIBUTE_NODE forces deep=true so its own children are walked.
			var shouldDeep = deep;
			switch (destNode.nodeType) {
				case ELEMENT_NODE:
					var attrs = srcNode.attributes;
					var attrs2 = (destNode.attributes = new NamedNodeMap());
					var len = attrs.length;
					attrs2._ownerElement = destNode;
					for (var i = 0; i < len; i++) {
						destNode.setAttributeNode(cloneNode(doc, attrs.item(i), true));
					}
					break;
				case ATTRIBUTE_NODE:
					shouldDeep = true;
			}
			// 3. Attach to parent, or capture as the root of the cloned subtree.
			if (destParent !== null) {
				destParent.appendChild(destNode);
			} else {
				destRoot = destNode;
			}
			// 4. Return destNode as the context for children (causes walkDOM to descend),
			//    or null to skip children (shallow clone).
			return shouldDeep ? destNode : null;
		},
	});
	return destRoot;
}

function __set__(object, key, value) {
	object[key] = value;
}

// Returns a new array of direct Element children.
// Passed to LiveNodeList to implement ParentNode.children.
// https://dom.spec.whatwg.org/#dom-parentnode-children
function childrenRefresh(node) {
	var ls = [];
	var child = node.firstChild;
	while (child) {
		if (child.nodeType === ELEMENT_NODE) {
			ls.push(child);
		}
		child = child.nextSibling;
	}
	return ls;
}

//do dynamic
try {
	if (Object.defineProperty) {
		Object.defineProperty(LiveNodeList.prototype, 'length', {
			get: function () {
				_updateLiveList(this);
				return this.$$length;
			},
		});

		/**
		 * The text content of this node and its descendants.
		 *
		 * For {@link Element} and {@link DocumentFragment} nodes, returns the concatenation of the
		 * `nodeValue` of every descendant text node, excluding processing instruction and comment
		 * nodes. For all other node types, returns `nodeValue`.
		 *
		 * Setting `textContent` on an element or document fragment replaces all child nodes with a
		 * single text node; on other nodes it sets `data`, `value`, and `nodeValue` directly.
		 *
		 * @type {string | null}
		 * @see {@link https://dom.spec.whatwg.org/#dom-node-textcontent}
		 */
		Object.defineProperty(Node.prototype, 'textContent', {
			get: function () {
				if (this.nodeType === ELEMENT_NODE || this.nodeType === DOCUMENT_FRAGMENT_NODE) {
					var buf = [];
					walkDOM(this, null, {
						enter: function (n) {
							if (n.nodeType === ELEMENT_NODE || n.nodeType === DOCUMENT_FRAGMENT_NODE) {
								return true; // enter children
							}
							if (n.nodeType === PROCESSING_INSTRUCTION_NODE || n.nodeType === COMMENT_NODE) {
								return null; // excluded from text content
							}
							buf.push(n.nodeValue);
						},
					});
					return buf.join('');
				}
				return this.nodeValue;
			},

			set: function (data) {
				switch (this.nodeType) {
					case ELEMENT_NODE:
					case DOCUMENT_FRAGMENT_NODE:
						while (this.firstChild) {
							this.removeChild(this.firstChild);
						}
						if (data || String(data)) {
							this.appendChild(this.ownerDocument.createTextNode(data));
						}
						break;

					default:
						this.data = data;
						this.value = data;
						this.nodeValue = data;
				}
			},
		});

		Object.defineProperty(CharacterData.prototype, 'data', {
			get: function () {
				return this._data != null ? this._data : '';
			},
			set: function (v) {
				this._data = v;
				this.length = typeof v === 'string' ? v.length : 0;
			},
		});

		Object.defineProperty(CharacterData.prototype, 'nodeValue', {
			get: function () {
				return this.data;
			},
			set: function (v) {
				this.data = v;
			},
			enumerable: true,
			configurable: true,
		});

		Object.defineProperty(Element.prototype, 'children', {
			get: function () {
				return new LiveNodeList(this, childrenRefresh);
			},
		});
		Object.defineProperty(Document.prototype, 'children', {
			get: function () {
				return new LiveNodeList(this, childrenRefresh);
			},
		});
		Object.defineProperty(DocumentFragment.prototype, 'children', {
			get: function () {
				return new LiveNodeList(this, childrenRefresh);
			},
		});

		__set__ = function (object, key, value) {
			//console.log(value)
			object['$$' + key] = value;
		};
	}
} catch (e) {
	//ie8
}

exports._updateLiveList = _updateLiveList;
exports.Attr = Attr;
exports.CDATASection = CDATASection;
exports.CharacterData = CharacterData;
exports.Comment = Comment;
exports.Document = Document;
exports.DocumentFragment = DocumentFragment;
exports.DocumentType = DocumentType;
exports.DOMImplementation = DOMImplementation;
exports.Element = Element;
exports.Entity = Entity;
exports.EntityReference = EntityReference;
exports.LiveNodeList = LiveNodeList;
exports.NamedNodeMap = NamedNodeMap;
exports.Node = Node;
exports.NodeList = NodeList;
exports.Notation = Notation;
exports.Text = Text;
exports.ProcessingInstruction = ProcessingInstruction;
exports.walkDOM = walkDOM;
exports.XMLSerializer = XMLSerializer;

},{"./conventions":2,"./errors":6,"./grammar":7}],5:[function(require,module,exports){
'use strict';

var freeze = require('./conventions').freeze;

/**
 * The entities that are predefined in every XML document.
 *
 * @see https://www.w3.org/TR/2006/REC-xml11-20060816/#sec-predefined-ent W3C XML 1.1
 * @see https://www.w3.org/TR/2008/REC-xml-20081126/#sec-predefined-ent W3C XML 1.0
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Predefined_entities_in_XML
 *      Wikipedia
 */
exports.XML_ENTITIES = freeze({
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	quot: '"',
});

/**
 * A map of all entities that are detected in an HTML document.
 * They contain all entries from `XML_ENTITIES`.
 *
 * @see {@link XML_ENTITIES}
 * @see {@link DOMParser.parseFromString}
 * @see {@link DOMImplementation.prototype.createHTMLDocument}
 * @see https://html.spec.whatwg.org/#named-character-references WHATWG HTML(5)
 *      Spec
 * @see https://html.spec.whatwg.org/entities.json JSON
 * @see https://www.w3.org/TR/xml-entity-names/ W3C XML Entity Names
 * @see https://www.w3.org/TR/html4/sgml/entities.html W3C HTML4/SGML
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Character_entity_references_in_HTML
 *      Wikipedia (HTML)
 * @see https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Entities_representing_special_characters_in_XHTML
 *      Wikpedia (XHTML)
 */
exports.HTML_ENTITIES = freeze({
	Aacute: '\u00C1',
	aacute: '\u00E1',
	Abreve: '\u0102',
	abreve: '\u0103',
	ac: '\u223E',
	acd: '\u223F',
	acE: '\u223E\u0333',
	Acirc: '\u00C2',
	acirc: '\u00E2',
	acute: '\u00B4',
	Acy: '\u0410',
	acy: '\u0430',
	AElig: '\u00C6',
	aelig: '\u00E6',
	af: '\u2061',
	Afr: '\uD835\uDD04',
	afr: '\uD835\uDD1E',
	Agrave: '\u00C0',
	agrave: '\u00E0',
	alefsym: '\u2135',
	aleph: '\u2135',
	Alpha: '\u0391',
	alpha: '\u03B1',
	Amacr: '\u0100',
	amacr: '\u0101',
	amalg: '\u2A3F',
	AMP: '\u0026',
	amp: '\u0026',
	And: '\u2A53',
	and: '\u2227',
	andand: '\u2A55',
	andd: '\u2A5C',
	andslope: '\u2A58',
	andv: '\u2A5A',
	ang: '\u2220',
	ange: '\u29A4',
	angle: '\u2220',
	angmsd: '\u2221',
	angmsdaa: '\u29A8',
	angmsdab: '\u29A9',
	angmsdac: '\u29AA',
	angmsdad: '\u29AB',
	angmsdae: '\u29AC',
	angmsdaf: '\u29AD',
	angmsdag: '\u29AE',
	angmsdah: '\u29AF',
	angrt: '\u221F',
	angrtvb: '\u22BE',
	angrtvbd: '\u299D',
	angsph: '\u2222',
	angst: '\u00C5',
	angzarr: '\u237C',
	Aogon: '\u0104',
	aogon: '\u0105',
	Aopf: '\uD835\uDD38',
	aopf: '\uD835\uDD52',
	ap: '\u2248',
	apacir: '\u2A6F',
	apE: '\u2A70',
	ape: '\u224A',
	apid: '\u224B',
	apos: '\u0027',
	ApplyFunction: '\u2061',
	approx: '\u2248',
	approxeq: '\u224A',
	Aring: '\u00C5',
	aring: '\u00E5',
	Ascr: '\uD835\uDC9C',
	ascr: '\uD835\uDCB6',
	Assign: '\u2254',
	ast: '\u002A',
	asymp: '\u2248',
	asympeq: '\u224D',
	Atilde: '\u00C3',
	atilde: '\u00E3',
	Auml: '\u00C4',
	auml: '\u00E4',
	awconint: '\u2233',
	awint: '\u2A11',
	backcong: '\u224C',
	backepsilon: '\u03F6',
	backprime: '\u2035',
	backsim: '\u223D',
	backsimeq: '\u22CD',
	Backslash: '\u2216',
	Barv: '\u2AE7',
	barvee: '\u22BD',
	Barwed: '\u2306',
	barwed: '\u2305',
	barwedge: '\u2305',
	bbrk: '\u23B5',
	bbrktbrk: '\u23B6',
	bcong: '\u224C',
	Bcy: '\u0411',
	bcy: '\u0431',
	bdquo: '\u201E',
	becaus: '\u2235',
	Because: '\u2235',
	because: '\u2235',
	bemptyv: '\u29B0',
	bepsi: '\u03F6',
	bernou: '\u212C',
	Bernoullis: '\u212C',
	Beta: '\u0392',
	beta: '\u03B2',
	beth: '\u2136',
	between: '\u226C',
	Bfr: '\uD835\uDD05',
	bfr: '\uD835\uDD1F',
	bigcap: '\u22C2',
	bigcirc: '\u25EF',
	bigcup: '\u22C3',
	bigodot: '\u2A00',
	bigoplus: '\u2A01',
	bigotimes: '\u2A02',
	bigsqcup: '\u2A06',
	bigstar: '\u2605',
	bigtriangledown: '\u25BD',
	bigtriangleup: '\u25B3',
	biguplus: '\u2A04',
	bigvee: '\u22C1',
	bigwedge: '\u22C0',
	bkarow: '\u290D',
	blacklozenge: '\u29EB',
	blacksquare: '\u25AA',
	blacktriangle: '\u25B4',
	blacktriangledown: '\u25BE',
	blacktriangleleft: '\u25C2',
	blacktriangleright: '\u25B8',
	blank: '\u2423',
	blk12: '\u2592',
	blk14: '\u2591',
	blk34: '\u2593',
	block: '\u2588',
	bne: '\u003D\u20E5',
	bnequiv: '\u2261\u20E5',
	bNot: '\u2AED',
	bnot: '\u2310',
	Bopf: '\uD835\uDD39',
	bopf: '\uD835\uDD53',
	bot: '\u22A5',
	bottom: '\u22A5',
	bowtie: '\u22C8',
	boxbox: '\u29C9',
	boxDL: '\u2557',
	boxDl: '\u2556',
	boxdL: '\u2555',
	boxdl: '\u2510',
	boxDR: '\u2554',
	boxDr: '\u2553',
	boxdR: '\u2552',
	boxdr: '\u250C',
	boxH: '\u2550',
	boxh: '\u2500',
	boxHD: '\u2566',
	boxHd: '\u2564',
	boxhD: '\u2565',
	boxhd: '\u252C',
	boxHU: '\u2569',
	boxHu: '\u2567',
	boxhU: '\u2568',
	boxhu: '\u2534',
	boxminus: '\u229F',
	boxplus: '\u229E',
	boxtimes: '\u22A0',
	boxUL: '\u255D',
	boxUl: '\u255C',
	boxuL: '\u255B',
	boxul: '\u2518',
	boxUR: '\u255A',
	boxUr: '\u2559',
	boxuR: '\u2558',
	boxur: '\u2514',
	boxV: '\u2551',
	boxv: '\u2502',
	boxVH: '\u256C',
	boxVh: '\u256B',
	boxvH: '\u256A',
	boxvh: '\u253C',
	boxVL: '\u2563',
	boxVl: '\u2562',
	boxvL: '\u2561',
	boxvl: '\u2524',
	boxVR: '\u2560',
	boxVr: '\u255F',
	boxvR: '\u255E',
	boxvr: '\u251C',
	bprime: '\u2035',
	Breve: '\u02D8',
	breve: '\u02D8',
	brvbar: '\u00A6',
	Bscr: '\u212C',
	bscr: '\uD835\uDCB7',
	bsemi: '\u204F',
	bsim: '\u223D',
	bsime: '\u22CD',
	bsol: '\u005C',
	bsolb: '\u29C5',
	bsolhsub: '\u27C8',
	bull: '\u2022',
	bullet: '\u2022',
	bump: '\u224E',
	bumpE: '\u2AAE',
	bumpe: '\u224F',
	Bumpeq: '\u224E',
	bumpeq: '\u224F',
	Cacute: '\u0106',
	cacute: '\u0107',
	Cap: '\u22D2',
	cap: '\u2229',
	capand: '\u2A44',
	capbrcup: '\u2A49',
	capcap: '\u2A4B',
	capcup: '\u2A47',
	capdot: '\u2A40',
	CapitalDifferentialD: '\u2145',
	caps: '\u2229\uFE00',
	caret: '\u2041',
	caron: '\u02C7',
	Cayleys: '\u212D',
	ccaps: '\u2A4D',
	Ccaron: '\u010C',
	ccaron: '\u010D',
	Ccedil: '\u00C7',
	ccedil: '\u00E7',
	Ccirc: '\u0108',
	ccirc: '\u0109',
	Cconint: '\u2230',
	ccups: '\u2A4C',
	ccupssm: '\u2A50',
	Cdot: '\u010A',
	cdot: '\u010B',
	cedil: '\u00B8',
	Cedilla: '\u00B8',
	cemptyv: '\u29B2',
	cent: '\u00A2',
	CenterDot: '\u00B7',
	centerdot: '\u00B7',
	Cfr: '\u212D',
	cfr: '\uD835\uDD20',
	CHcy: '\u0427',
	chcy: '\u0447',
	check: '\u2713',
	checkmark: '\u2713',
	Chi: '\u03A7',
	chi: '\u03C7',
	cir: '\u25CB',
	circ: '\u02C6',
	circeq: '\u2257',
	circlearrowleft: '\u21BA',
	circlearrowright: '\u21BB',
	circledast: '\u229B',
	circledcirc: '\u229A',
	circleddash: '\u229D',
	CircleDot: '\u2299',
	circledR: '\u00AE',
	circledS: '\u24C8',
	CircleMinus: '\u2296',
	CirclePlus: '\u2295',
	CircleTimes: '\u2297',
	cirE: '\u29C3',
	cire: '\u2257',
	cirfnint: '\u2A10',
	cirmid: '\u2AEF',
	cirscir: '\u29C2',
	ClockwiseContourIntegral: '\u2232',
	CloseCurlyDoubleQuote: '\u201D',
	CloseCurlyQuote: '\u2019',
	clubs: '\u2663',
	clubsuit: '\u2663',
	Colon: '\u2237',
	colon: '\u003A',
	Colone: '\u2A74',
	colone: '\u2254',
	coloneq: '\u2254',
	comma: '\u002C',
	commat: '\u0040',
	comp: '\u2201',
	compfn: '\u2218',
	complement: '\u2201',
	complexes: '\u2102',
	cong: '\u2245',
	congdot: '\u2A6D',
	Congruent: '\u2261',
	Conint: '\u222F',
	conint: '\u222E',
	ContourIntegral: '\u222E',
	Copf: '\u2102',
	copf: '\uD835\uDD54',
	coprod: '\u2210',
	Coproduct: '\u2210',
	COPY: '\u00A9',
	copy: '\u00A9',
	copysr: '\u2117',
	CounterClockwiseContourIntegral: '\u2233',
	crarr: '\u21B5',
	Cross: '\u2A2F',
	cross: '\u2717',
	Cscr: '\uD835\uDC9E',
	cscr: '\uD835\uDCB8',
	csub: '\u2ACF',
	csube: '\u2AD1',
	csup: '\u2AD0',
	csupe: '\u2AD2',
	ctdot: '\u22EF',
	cudarrl: '\u2938',
	cudarrr: '\u2935',
	cuepr: '\u22DE',
	cuesc: '\u22DF',
	cularr: '\u21B6',
	cularrp: '\u293D',
	Cup: '\u22D3',
	cup: '\u222A',
	cupbrcap: '\u2A48',
	CupCap: '\u224D',
	cupcap: '\u2A46',
	cupcup: '\u2A4A',
	cupdot: '\u228D',
	cupor: '\u2A45',
	cups: '\u222A\uFE00',
	curarr: '\u21B7',
	curarrm: '\u293C',
	curlyeqprec: '\u22DE',
	curlyeqsucc: '\u22DF',
	curlyvee: '\u22CE',
	curlywedge: '\u22CF',
	curren: '\u00A4',
	curvearrowleft: '\u21B6',
	curvearrowright: '\u21B7',
	cuvee: '\u22CE',
	cuwed: '\u22CF',
	cwconint: '\u2232',
	cwint: '\u2231',
	cylcty: '\u232D',
	Dagger: '\u2021',
	dagger: '\u2020',
	daleth: '\u2138',
	Darr: '\u21A1',
	dArr: '\u21D3',
	darr: '\u2193',
	dash: '\u2010',
	Dashv: '\u2AE4',
	dashv: '\u22A3',
	dbkarow: '\u290F',
	dblac: '\u02DD',
	Dcaron: '\u010E',
	dcaron: '\u010F',
	Dcy: '\u0414',
	dcy: '\u0434',
	DD: '\u2145',
	dd: '\u2146',
	ddagger: '\u2021',
	ddarr: '\u21CA',
	DDotrahd: '\u2911',
	ddotseq: '\u2A77',
	deg: '\u00B0',
	Del: '\u2207',
	Delta: '\u0394',
	delta: '\u03B4',
	demptyv: '\u29B1',
	dfisht: '\u297F',
	Dfr: '\uD835\uDD07',
	dfr: '\uD835\uDD21',
	dHar: '\u2965',
	dharl: '\u21C3',
	dharr: '\u21C2',
	DiacriticalAcute: '\u00B4',
	DiacriticalDot: '\u02D9',
	DiacriticalDoubleAcute: '\u02DD',
	DiacriticalGrave: '\u0060',
	DiacriticalTilde: '\u02DC',
	diam: '\u22C4',
	Diamond: '\u22C4',
	diamond: '\u22C4',
	diamondsuit: '\u2666',
	diams: '\u2666',
	die: '\u00A8',
	DifferentialD: '\u2146',
	digamma: '\u03DD',
	disin: '\u22F2',
	div: '\u00F7',
	divide: '\u00F7',
	divideontimes: '\u22C7',
	divonx: '\u22C7',
	DJcy: '\u0402',
	djcy: '\u0452',
	dlcorn: '\u231E',
	dlcrop: '\u230D',
	dollar: '\u0024',
	Dopf: '\uD835\uDD3B',
	dopf: '\uD835\uDD55',
	Dot: '\u00A8',
	dot: '\u02D9',
	DotDot: '\u20DC',
	doteq: '\u2250',
	doteqdot: '\u2251',
	DotEqual: '\u2250',
	dotminus: '\u2238',
	dotplus: '\u2214',
	dotsquare: '\u22A1',
	doublebarwedge: '\u2306',
	DoubleContourIntegral: '\u222F',
	DoubleDot: '\u00A8',
	DoubleDownArrow: '\u21D3',
	DoubleLeftArrow: '\u21D0',
	DoubleLeftRightArrow: '\u21D4',
	DoubleLeftTee: '\u2AE4',
	DoubleLongLeftArrow: '\u27F8',
	DoubleLongLeftRightArrow: '\u27FA',
	DoubleLongRightArrow: '\u27F9',
	DoubleRightArrow: '\u21D2',
	DoubleRightTee: '\u22A8',
	DoubleUpArrow: '\u21D1',
	DoubleUpDownArrow: '\u21D5',
	DoubleVerticalBar: '\u2225',
	DownArrow: '\u2193',
	Downarrow: '\u21D3',
	downarrow: '\u2193',
	DownArrowBar: '\u2913',
	DownArrowUpArrow: '\u21F5',
	DownBreve: '\u0311',
	downdownarrows: '\u21CA',
	downharpoonleft: '\u21C3',
	downharpoonright: '\u21C2',
	DownLeftRightVector: '\u2950',
	DownLeftTeeVector: '\u295E',
	DownLeftVector: '\u21BD',
	DownLeftVectorBar: '\u2956',
	DownRightTeeVector: '\u295F',
	DownRightVector: '\u21C1',
	DownRightVectorBar: '\u2957',
	DownTee: '\u22A4',
	DownTeeArrow: '\u21A7',
	drbkarow: '\u2910',
	drcorn: '\u231F',
	drcrop: '\u230C',
	Dscr: '\uD835\uDC9F',
	dscr: '\uD835\uDCB9',
	DScy: '\u0405',
	dscy: '\u0455',
	dsol: '\u29F6',
	Dstrok: '\u0110',
	dstrok: '\u0111',
	dtdot: '\u22F1',
	dtri: '\u25BF',
	dtrif: '\u25BE',
	duarr: '\u21F5',
	duhar: '\u296F',
	dwangle: '\u29A6',
	DZcy: '\u040F',
	dzcy: '\u045F',
	dzigrarr: '\u27FF',
	Eacute: '\u00C9',
	eacute: '\u00E9',
	easter: '\u2A6E',
	Ecaron: '\u011A',
	ecaron: '\u011B',
	ecir: '\u2256',
	Ecirc: '\u00CA',
	ecirc: '\u00EA',
	ecolon: '\u2255',
	Ecy: '\u042D',
	ecy: '\u044D',
	eDDot: '\u2A77',
	Edot: '\u0116',
	eDot: '\u2251',
	edot: '\u0117',
	ee: '\u2147',
	efDot: '\u2252',
	Efr: '\uD835\uDD08',
	efr: '\uD835\uDD22',
	eg: '\u2A9A',
	Egrave: '\u00C8',
	egrave: '\u00E8',
	egs: '\u2A96',
	egsdot: '\u2A98',
	el: '\u2A99',
	Element: '\u2208',
	elinters: '\u23E7',
	ell: '\u2113',
	els: '\u2A95',
	elsdot: '\u2A97',
	Emacr: '\u0112',
	emacr: '\u0113',
	empty: '\u2205',
	emptyset: '\u2205',
	EmptySmallSquare: '\u25FB',
	emptyv: '\u2205',
	EmptyVerySmallSquare: '\u25AB',
	emsp: '\u2003',
	emsp13: '\u2004',
	emsp14: '\u2005',
	ENG: '\u014A',
	eng: '\u014B',
	ensp: '\u2002',
	Eogon: '\u0118',
	eogon: '\u0119',
	Eopf: '\uD835\uDD3C',
	eopf: '\uD835\uDD56',
	epar: '\u22D5',
	eparsl: '\u29E3',
	eplus: '\u2A71',
	epsi: '\u03B5',
	Epsilon: '\u0395',
	epsilon: '\u03B5',
	epsiv: '\u03F5',
	eqcirc: '\u2256',
	eqcolon: '\u2255',
	eqsim: '\u2242',
	eqslantgtr: '\u2A96',
	eqslantless: '\u2A95',
	Equal: '\u2A75',
	equals: '\u003D',
	EqualTilde: '\u2242',
	equest: '\u225F',
	Equilibrium: '\u21CC',
	equiv: '\u2261',
	equivDD: '\u2A78',
	eqvparsl: '\u29E5',
	erarr: '\u2971',
	erDot: '\u2253',
	Escr: '\u2130',
	escr: '\u212F',
	esdot: '\u2250',
	Esim: '\u2A73',
	esim: '\u2242',
	Eta: '\u0397',
	eta: '\u03B7',
	ETH: '\u00D0',
	eth: '\u00F0',
	Euml: '\u00CB',
	euml: '\u00EB',
	euro: '\u20AC',
	excl: '\u0021',
	exist: '\u2203',
	Exists: '\u2203',
	expectation: '\u2130',
	ExponentialE: '\u2147',
	exponentiale: '\u2147',
	fallingdotseq: '\u2252',
	Fcy: '\u0424',
	fcy: '\u0444',
	female: '\u2640',
	ffilig: '\uFB03',
	fflig: '\uFB00',
	ffllig: '\uFB04',
	Ffr: '\uD835\uDD09',
	ffr: '\uD835\uDD23',
	filig: '\uFB01',
	FilledSmallSquare: '\u25FC',
	FilledVerySmallSquare: '\u25AA',
	fjlig: '\u0066\u006A',
	flat: '\u266D',
	fllig: '\uFB02',
	fltns: '\u25B1',
	fnof: '\u0192',
	Fopf: '\uD835\uDD3D',
	fopf: '\uD835\uDD57',
	ForAll: '\u2200',
	forall: '\u2200',
	fork: '\u22D4',
	forkv: '\u2AD9',
	Fouriertrf: '\u2131',
	fpartint: '\u2A0D',
	frac12: '\u00BD',
	frac13: '\u2153',
	frac14: '\u00BC',
	frac15: '\u2155',
	frac16: '\u2159',
	frac18: '\u215B',
	frac23: '\u2154',
	frac25: '\u2156',
	frac34: '\u00BE',
	frac35: '\u2157',
	frac38: '\u215C',
	frac45: '\u2158',
	frac56: '\u215A',
	frac58: '\u215D',
	frac78: '\u215E',
	frasl: '\u2044',
	frown: '\u2322',
	Fscr: '\u2131',
	fscr: '\uD835\uDCBB',
	gacute: '\u01F5',
	Gamma: '\u0393',
	gamma: '\u03B3',
	Gammad: '\u03DC',
	gammad: '\u03DD',
	gap: '\u2A86',
	Gbreve: '\u011E',
	gbreve: '\u011F',
	Gcedil: '\u0122',
	Gcirc: '\u011C',
	gcirc: '\u011D',
	Gcy: '\u0413',
	gcy: '\u0433',
	Gdot: '\u0120',
	gdot: '\u0121',
	gE: '\u2267',
	ge: '\u2265',
	gEl: '\u2A8C',
	gel: '\u22DB',
	geq: '\u2265',
	geqq: '\u2267',
	geqslant: '\u2A7E',
	ges: '\u2A7E',
	gescc: '\u2AA9',
	gesdot: '\u2A80',
	gesdoto: '\u2A82',
	gesdotol: '\u2A84',
	gesl: '\u22DB\uFE00',
	gesles: '\u2A94',
	Gfr: '\uD835\uDD0A',
	gfr: '\uD835\uDD24',
	Gg: '\u22D9',
	gg: '\u226B',
	ggg: '\u22D9',
	gimel: '\u2137',
	GJcy: '\u0403',
	gjcy: '\u0453',
	gl: '\u2277',
	gla: '\u2AA5',
	glE: '\u2A92',
	glj: '\u2AA4',
	gnap: '\u2A8A',
	gnapprox: '\u2A8A',
	gnE: '\u2269',
	gne: '\u2A88',
	gneq: '\u2A88',
	gneqq: '\u2269',
	gnsim: '\u22E7',
	Gopf: '\uD835\uDD3E',
	gopf: '\uD835\uDD58',
	grave: '\u0060',
	GreaterEqual: '\u2265',
	GreaterEqualLess: '\u22DB',
	GreaterFullEqual: '\u2267',
	GreaterGreater: '\u2AA2',
	GreaterLess: '\u2277',
	GreaterSlantEqual: '\u2A7E',
	GreaterTilde: '\u2273',
	Gscr: '\uD835\uDCA2',
	gscr: '\u210A',
	gsim: '\u2273',
	gsime: '\u2A8E',
	gsiml: '\u2A90',
	Gt: '\u226B',
	GT: '\u003E',
	gt: '\u003E',
	gtcc: '\u2AA7',
	gtcir: '\u2A7A',
	gtdot: '\u22D7',
	gtlPar: '\u2995',
	gtquest: '\u2A7C',
	gtrapprox: '\u2A86',
	gtrarr: '\u2978',
	gtrdot: '\u22D7',
	gtreqless: '\u22DB',
	gtreqqless: '\u2A8C',
	gtrless: '\u2277',
	gtrsim: '\u2273',
	gvertneqq: '\u2269\uFE00',
	gvnE: '\u2269\uFE00',
	Hacek: '\u02C7',
	hairsp: '\u200A',
	half: '\u00BD',
	hamilt: '\u210B',
	HARDcy: '\u042A',
	hardcy: '\u044A',
	hArr: '\u21D4',
	harr: '\u2194',
	harrcir: '\u2948',
	harrw: '\u21AD',
	Hat: '\u005E',
	hbar: '\u210F',
	Hcirc: '\u0124',
	hcirc: '\u0125',
	hearts: '\u2665',
	heartsuit: '\u2665',
	hellip: '\u2026',
	hercon: '\u22B9',
	Hfr: '\u210C',
	hfr: '\uD835\uDD25',
	HilbertSpace: '\u210B',
	hksearow: '\u2925',
	hkswarow: '\u2926',
	hoarr: '\u21FF',
	homtht: '\u223B',
	hookleftarrow: '\u21A9',
	hookrightarrow: '\u21AA',
	Hopf: '\u210D',
	hopf: '\uD835\uDD59',
	horbar: '\u2015',
	HorizontalLine: '\u2500',
	Hscr: '\u210B',
	hscr: '\uD835\uDCBD',
	hslash: '\u210F',
	Hstrok: '\u0126',
	hstrok: '\u0127',
	HumpDownHump: '\u224E',
	HumpEqual: '\u224F',
	hybull: '\u2043',
	hyphen: '\u2010',
	Iacute: '\u00CD',
	iacute: '\u00ED',
	ic: '\u2063',
	Icirc: '\u00CE',
	icirc: '\u00EE',
	Icy: '\u0418',
	icy: '\u0438',
	Idot: '\u0130',
	IEcy: '\u0415',
	iecy: '\u0435',
	iexcl: '\u00A1',
	iff: '\u21D4',
	Ifr: '\u2111',
	ifr: '\uD835\uDD26',
	Igrave: '\u00CC',
	igrave: '\u00EC',
	ii: '\u2148',
	iiiint: '\u2A0C',
	iiint: '\u222D',
	iinfin: '\u29DC',
	iiota: '\u2129',
	IJlig: '\u0132',
	ijlig: '\u0133',
	Im: '\u2111',
	Imacr: '\u012A',
	imacr: '\u012B',
	image: '\u2111',
	ImaginaryI: '\u2148',
	imagline: '\u2110',
	imagpart: '\u2111',
	imath: '\u0131',
	imof: '\u22B7',
	imped: '\u01B5',
	Implies: '\u21D2',
	in: '\u2208',
	incare: '\u2105',
	infin: '\u221E',
	infintie: '\u29DD',
	inodot: '\u0131',
	Int: '\u222C',
	int: '\u222B',
	intcal: '\u22BA',
	integers: '\u2124',
	Integral: '\u222B',
	intercal: '\u22BA',
	Intersection: '\u22C2',
	intlarhk: '\u2A17',
	intprod: '\u2A3C',
	InvisibleComma: '\u2063',
	InvisibleTimes: '\u2062',
	IOcy: '\u0401',
	iocy: '\u0451',
	Iogon: '\u012E',
	iogon: '\u012F',
	Iopf: '\uD835\uDD40',
	iopf: '\uD835\uDD5A',
	Iota: '\u0399',
	iota: '\u03B9',
	iprod: '\u2A3C',
	iquest: '\u00BF',
	Iscr: '\u2110',
	iscr: '\uD835\uDCBE',
	isin: '\u2208',
	isindot: '\u22F5',
	isinE: '\u22F9',
	isins: '\u22F4',
	isinsv: '\u22F3',
	isinv: '\u2208',
	it: '\u2062',
	Itilde: '\u0128',
	itilde: '\u0129',
	Iukcy: '\u0406',
	iukcy: '\u0456',
	Iuml: '\u00CF',
	iuml: '\u00EF',
	Jcirc: '\u0134',
	jcirc: '\u0135',
	Jcy: '\u0419',
	jcy: '\u0439',
	Jfr: '\uD835\uDD0D',
	jfr: '\uD835\uDD27',
	jmath: '\u0237',
	Jopf: '\uD835\uDD41',
	jopf: '\uD835\uDD5B',
	Jscr: '\uD835\uDCA5',
	jscr: '\uD835\uDCBF',
	Jsercy: '\u0408',
	jsercy: '\u0458',
	Jukcy: '\u0404',
	jukcy: '\u0454',
	Kappa: '\u039A',
	kappa: '\u03BA',
	kappav: '\u03F0',
	Kcedil: '\u0136',
	kcedil: '\u0137',
	Kcy: '\u041A',
	kcy: '\u043A',
	Kfr: '\uD835\uDD0E',
	kfr: '\uD835\uDD28',
	kgreen: '\u0138',
	KHcy: '\u0425',
	khcy: '\u0445',
	KJcy: '\u040C',
	kjcy: '\u045C',
	Kopf: '\uD835\uDD42',
	kopf: '\uD835\uDD5C',
	Kscr: '\uD835\uDCA6',
	kscr: '\uD835\uDCC0',
	lAarr: '\u21DA',
	Lacute: '\u0139',
	lacute: '\u013A',
	laemptyv: '\u29B4',
	lagran: '\u2112',
	Lambda: '\u039B',
	lambda: '\u03BB',
	Lang: '\u27EA',
	lang: '\u27E8',
	langd: '\u2991',
	langle: '\u27E8',
	lap: '\u2A85',
	Laplacetrf: '\u2112',
	laquo: '\u00AB',
	Larr: '\u219E',
	lArr: '\u21D0',
	larr: '\u2190',
	larrb: '\u21E4',
	larrbfs: '\u291F',
	larrfs: '\u291D',
	larrhk: '\u21A9',
	larrlp: '\u21AB',
	larrpl: '\u2939',
	larrsim: '\u2973',
	larrtl: '\u21A2',
	lat: '\u2AAB',
	lAtail: '\u291B',
	latail: '\u2919',
	late: '\u2AAD',
	lates: '\u2AAD\uFE00',
	lBarr: '\u290E',
	lbarr: '\u290C',
	lbbrk: '\u2772',
	lbrace: '\u007B',
	lbrack: '\u005B',
	lbrke: '\u298B',
	lbrksld: '\u298F',
	lbrkslu: '\u298D',
	Lcaron: '\u013D',
	lcaron: '\u013E',
	Lcedil: '\u013B',
	lcedil: '\u013C',
	lceil: '\u2308',
	lcub: '\u007B',
	Lcy: '\u041B',
	lcy: '\u043B',
	ldca: '\u2936',
	ldquo: '\u201C',
	ldquor: '\u201E',
	ldrdhar: '\u2967',
	ldrushar: '\u294B',
	ldsh: '\u21B2',
	lE: '\u2266',
	le: '\u2264',
	LeftAngleBracket: '\u27E8',
	LeftArrow: '\u2190',
	Leftarrow: '\u21D0',
	leftarrow: '\u2190',
	LeftArrowBar: '\u21E4',
	LeftArrowRightArrow: '\u21C6',
	leftarrowtail: '\u21A2',
	LeftCeiling: '\u2308',
	LeftDoubleBracket: '\u27E6',
	LeftDownTeeVector: '\u2961',
	LeftDownVector: '\u21C3',
	LeftDownVectorBar: '\u2959',
	LeftFloor: '\u230A',
	leftharpoondown: '\u21BD',
	leftharpoonup: '\u21BC',
	leftleftarrows: '\u21C7',
	LeftRightArrow: '\u2194',
	Leftrightarrow: '\u21D4',
	leftrightarrow: '\u2194',
	leftrightarrows: '\u21C6',
	leftrightharpoons: '\u21CB',
	leftrightsquigarrow: '\u21AD',
	LeftRightVector: '\u294E',
	LeftTee: '\u22A3',
	LeftTeeArrow: '\u21A4',
	LeftTeeVector: '\u295A',
	leftthreetimes: '\u22CB',
	LeftTriangle: '\u22B2',
	LeftTriangleBar: '\u29CF',
	LeftTriangleEqual: '\u22B4',
	LeftUpDownVector: '\u2951',
	LeftUpTeeVector: '\u2960',
	LeftUpVector: '\u21BF',
	LeftUpVectorBar: '\u2958',
	LeftVector: '\u21BC',
	LeftVectorBar: '\u2952',
	lEg: '\u2A8B',
	leg: '\u22DA',
	leq: '\u2264',
	leqq: '\u2266',
	leqslant: '\u2A7D',
	les: '\u2A7D',
	lescc: '\u2AA8',
	lesdot: '\u2A7F',
	lesdoto: '\u2A81',
	lesdotor: '\u2A83',
	lesg: '\u22DA\uFE00',
	lesges: '\u2A93',
	lessapprox: '\u2A85',
	lessdot: '\u22D6',
	lesseqgtr: '\u22DA',
	lesseqqgtr: '\u2A8B',
	LessEqualGreater: '\u22DA',
	LessFullEqual: '\u2266',
	LessGreater: '\u2276',
	lessgtr: '\u2276',
	LessLess: '\u2AA1',
	lesssim: '\u2272',
	LessSlantEqual: '\u2A7D',
	LessTilde: '\u2272',
	lfisht: '\u297C',
	lfloor: '\u230A',
	Lfr: '\uD835\uDD0F',
	lfr: '\uD835\uDD29',
	lg: '\u2276',
	lgE: '\u2A91',
	lHar: '\u2962',
	lhard: '\u21BD',
	lharu: '\u21BC',
	lharul: '\u296A',
	lhblk: '\u2584',
	LJcy: '\u0409',
	ljcy: '\u0459',
	Ll: '\u22D8',
	ll: '\u226A',
	llarr: '\u21C7',
	llcorner: '\u231E',
	Lleftarrow: '\u21DA',
	llhard: '\u296B',
	lltri: '\u25FA',
	Lmidot: '\u013F',
	lmidot: '\u0140',
	lmoust: '\u23B0',
	lmoustache: '\u23B0',
	lnap: '\u2A89',
	lnapprox: '\u2A89',
	lnE: '\u2268',
	lne: '\u2A87',
	lneq: '\u2A87',
	lneqq: '\u2268',
	lnsim: '\u22E6',
	loang: '\u27EC',
	loarr: '\u21FD',
	lobrk: '\u27E6',
	LongLeftArrow: '\u27F5',
	Longleftarrow: '\u27F8',
	longleftarrow: '\u27F5',
	LongLeftRightArrow: '\u27F7',
	Longleftrightarrow: '\u27FA',
	longleftrightarrow: '\u27F7',
	longmapsto: '\u27FC',
	LongRightArrow: '\u27F6',
	Longrightarrow: '\u27F9',
	longrightarrow: '\u27F6',
	looparrowleft: '\u21AB',
	looparrowright: '\u21AC',
	lopar: '\u2985',
	Lopf: '\uD835\uDD43',
	lopf: '\uD835\uDD5D',
	loplus: '\u2A2D',
	lotimes: '\u2A34',
	lowast: '\u2217',
	lowbar: '\u005F',
	LowerLeftArrow: '\u2199',
	LowerRightArrow: '\u2198',
	loz: '\u25CA',
	lozenge: '\u25CA',
	lozf: '\u29EB',
	lpar: '\u0028',
	lparlt: '\u2993',
	lrarr: '\u21C6',
	lrcorner: '\u231F',
	lrhar: '\u21CB',
	lrhard: '\u296D',
	lrm: '\u200E',
	lrtri: '\u22BF',
	lsaquo: '\u2039',
	Lscr: '\u2112',
	lscr: '\uD835\uDCC1',
	Lsh: '\u21B0',
	lsh: '\u21B0',
	lsim: '\u2272',
	lsime: '\u2A8D',
	lsimg: '\u2A8F',
	lsqb: '\u005B',
	lsquo: '\u2018',
	lsquor: '\u201A',
	Lstrok: '\u0141',
	lstrok: '\u0142',
	Lt: '\u226A',
	LT: '\u003C',
	lt: '\u003C',
	ltcc: '\u2AA6',
	ltcir: '\u2A79',
	ltdot: '\u22D6',
	lthree: '\u22CB',
	ltimes: '\u22C9',
	ltlarr: '\u2976',
	ltquest: '\u2A7B',
	ltri: '\u25C3',
	ltrie: '\u22B4',
	ltrif: '\u25C2',
	ltrPar: '\u2996',
	lurdshar: '\u294A',
	luruhar: '\u2966',
	lvertneqq: '\u2268\uFE00',
	lvnE: '\u2268\uFE00',
	macr: '\u00AF',
	male: '\u2642',
	malt: '\u2720',
	maltese: '\u2720',
	Map: '\u2905',
	map: '\u21A6',
	mapsto: '\u21A6',
	mapstodown: '\u21A7',
	mapstoleft: '\u21A4',
	mapstoup: '\u21A5',
	marker: '\u25AE',
	mcomma: '\u2A29',
	Mcy: '\u041C',
	mcy: '\u043C',
	mdash: '\u2014',
	mDDot: '\u223A',
	measuredangle: '\u2221',
	MediumSpace: '\u205F',
	Mellintrf: '\u2133',
	Mfr: '\uD835\uDD10',
	mfr: '\uD835\uDD2A',
	mho: '\u2127',
	micro: '\u00B5',
	mid: '\u2223',
	midast: '\u002A',
	midcir: '\u2AF0',
	middot: '\u00B7',
	minus: '\u2212',
	minusb: '\u229F',
	minusd: '\u2238',
	minusdu: '\u2A2A',
	MinusPlus: '\u2213',
	mlcp: '\u2ADB',
	mldr: '\u2026',
	mnplus: '\u2213',
	models: '\u22A7',
	Mopf: '\uD835\uDD44',
	mopf: '\uD835\uDD5E',
	mp: '\u2213',
	Mscr: '\u2133',
	mscr: '\uD835\uDCC2',
	mstpos: '\u223E',
	Mu: '\u039C',
	mu: '\u03BC',
	multimap: '\u22B8',
	mumap: '\u22B8',
	nabla: '\u2207',
	Nacute: '\u0143',
	nacute: '\u0144',
	nang: '\u2220\u20D2',
	nap: '\u2249',
	napE: '\u2A70\u0338',
	napid: '\u224B\u0338',
	napos: '\u0149',
	napprox: '\u2249',
	natur: '\u266E',
	natural: '\u266E',
	naturals: '\u2115',
	nbsp: '\u00A0',
	nbump: '\u224E\u0338',
	nbumpe: '\u224F\u0338',
	ncap: '\u2A43',
	Ncaron: '\u0147',
	ncaron: '\u0148',
	Ncedil: '\u0145',
	ncedil: '\u0146',
	ncong: '\u2247',
	ncongdot: '\u2A6D\u0338',
	ncup: '\u2A42',
	Ncy: '\u041D',
	ncy: '\u043D',
	ndash: '\u2013',
	ne: '\u2260',
	nearhk: '\u2924',
	neArr: '\u21D7',
	nearr: '\u2197',
	nearrow: '\u2197',
	nedot: '\u2250\u0338',
	NegativeMediumSpace: '\u200B',
	NegativeThickSpace: '\u200B',
	NegativeThinSpace: '\u200B',
	NegativeVeryThinSpace: '\u200B',
	nequiv: '\u2262',
	nesear: '\u2928',
	nesim: '\u2242\u0338',
	NestedGreaterGreater: '\u226B',
	NestedLessLess: '\u226A',
	NewLine: '\u000A',
	nexist: '\u2204',
	nexists: '\u2204',
	Nfr: '\uD835\uDD11',
	nfr: '\uD835\uDD2B',
	ngE: '\u2267\u0338',
	nge: '\u2271',
	ngeq: '\u2271',
	ngeqq: '\u2267\u0338',
	ngeqslant: '\u2A7E\u0338',
	nges: '\u2A7E\u0338',
	nGg: '\u22D9\u0338',
	ngsim: '\u2275',
	nGt: '\u226B\u20D2',
	ngt: '\u226F',
	ngtr: '\u226F',
	nGtv: '\u226B\u0338',
	nhArr: '\u21CE',
	nharr: '\u21AE',
	nhpar: '\u2AF2',
	ni: '\u220B',
	nis: '\u22FC',
	nisd: '\u22FA',
	niv: '\u220B',
	NJcy: '\u040A',
	njcy: '\u045A',
	nlArr: '\u21CD',
	nlarr: '\u219A',
	nldr: '\u2025',
	nlE: '\u2266\u0338',
	nle: '\u2270',
	nLeftarrow: '\u21CD',
	nleftarrow: '\u219A',
	nLeftrightarrow: '\u21CE',
	nleftrightarrow: '\u21AE',
	nleq: '\u2270',
	nleqq: '\u2266\u0338',
	nleqslant: '\u2A7D\u0338',
	nles: '\u2A7D\u0338',
	nless: '\u226E',
	nLl: '\u22D8\u0338',
	nlsim: '\u2274',
	nLt: '\u226A\u20D2',
	nlt: '\u226E',
	nltri: '\u22EA',
	nltrie: '\u22EC',
	nLtv: '\u226A\u0338',
	nmid: '\u2224',
	NoBreak: '\u2060',
	NonBreakingSpace: '\u00A0',
	Nopf: '\u2115',
	nopf: '\uD835\uDD5F',
	Not: '\u2AEC',
	not: '\u00AC',
	NotCongruent: '\u2262',
	NotCupCap: '\u226D',
	NotDoubleVerticalBar: '\u2226',
	NotElement: '\u2209',
	NotEqual: '\u2260',
	NotEqualTilde: '\u2242\u0338',
	NotExists: '\u2204',
	NotGreater: '\u226F',
	NotGreaterEqual: '\u2271',
	NotGreaterFullEqual: '\u2267\u0338',
	NotGreaterGreater: '\u226B\u0338',
	NotGreaterLess: '\u2279',
	NotGreaterSlantEqual: '\u2A7E\u0338',
	NotGreaterTilde: '\u2275',
	NotHumpDownHump: '\u224E\u0338',
	NotHumpEqual: '\u224F\u0338',
	notin: '\u2209',
	notindot: '\u22F5\u0338',
	notinE: '\u22F9\u0338',
	notinva: '\u2209',
	notinvb: '\u22F7',
	notinvc: '\u22F6',
	NotLeftTriangle: '\u22EA',
	NotLeftTriangleBar: '\u29CF\u0338',
	NotLeftTriangleEqual: '\u22EC',
	NotLess: '\u226E',
	NotLessEqual: '\u2270',
	NotLessGreater: '\u2278',
	NotLessLess: '\u226A\u0338',
	NotLessSlantEqual: '\u2A7D\u0338',
	NotLessTilde: '\u2274',
	NotNestedGreaterGreater: '\u2AA2\u0338',
	NotNestedLessLess: '\u2AA1\u0338',
	notni: '\u220C',
	notniva: '\u220C',
	notnivb: '\u22FE',
	notnivc: '\u22FD',
	NotPrecedes: '\u2280',
	NotPrecedesEqual: '\u2AAF\u0338',
	NotPrecedesSlantEqual: '\u22E0',
	NotReverseElement: '\u220C',
	NotRightTriangle: '\u22EB',
	NotRightTriangleBar: '\u29D0\u0338',
	NotRightTriangleEqual: '\u22ED',
	NotSquareSubset: '\u228F\u0338',
	NotSquareSubsetEqual: '\u22E2',
	NotSquareSuperset: '\u2290\u0338',
	NotSquareSupersetEqual: '\u22E3',
	NotSubset: '\u2282\u20D2',
	NotSubsetEqual: '\u2288',
	NotSucceeds: '\u2281',
	NotSucceedsEqual: '\u2AB0\u0338',
	NotSucceedsSlantEqual: '\u22E1',
	NotSucceedsTilde: '\u227F\u0338',
	NotSuperset: '\u2283\u20D2',
	NotSupersetEqual: '\u2289',
	NotTilde: '\u2241',
	NotTildeEqual: '\u2244',
	NotTildeFullEqual: '\u2247',
	NotTildeTilde: '\u2249',
	NotVerticalBar: '\u2224',
	npar: '\u2226',
	nparallel: '\u2226',
	nparsl: '\u2AFD\u20E5',
	npart: '\u2202\u0338',
	npolint: '\u2A14',
	npr: '\u2280',
	nprcue: '\u22E0',
	npre: '\u2AAF\u0338',
	nprec: '\u2280',
	npreceq: '\u2AAF\u0338',
	nrArr: '\u21CF',
	nrarr: '\u219B',
	nrarrc: '\u2933\u0338',
	nrarrw: '\u219D\u0338',
	nRightarrow: '\u21CF',
	nrightarrow: '\u219B',
	nrtri: '\u22EB',
	nrtrie: '\u22ED',
	nsc: '\u2281',
	nsccue: '\u22E1',
	nsce: '\u2AB0\u0338',
	Nscr: '\uD835\uDCA9',
	nscr: '\uD835\uDCC3',
	nshortmid: '\u2224',
	nshortparallel: '\u2226',
	nsim: '\u2241',
	nsime: '\u2244',
	nsimeq: '\u2244',
	nsmid: '\u2224',
	nspar: '\u2226',
	nsqsube: '\u22E2',
	nsqsupe: '\u22E3',
	nsub: '\u2284',
	nsubE: '\u2AC5\u0338',
	nsube: '\u2288',
	nsubset: '\u2282\u20D2',
	nsubseteq: '\u2288',
	nsubseteqq: '\u2AC5\u0338',
	nsucc: '\u2281',
	nsucceq: '\u2AB0\u0338',
	nsup: '\u2285',
	nsupE: '\u2AC6\u0338',
	nsupe: '\u2289',
	nsupset: '\u2283\u20D2',
	nsupseteq: '\u2289',
	nsupseteqq: '\u2AC6\u0338',
	ntgl: '\u2279',
	Ntilde: '\u00D1',
	ntilde: '\u00F1',
	ntlg: '\u2278',
	ntriangleleft: '\u22EA',
	ntrianglelefteq: '\u22EC',
	ntriangleright: '\u22EB',
	ntrianglerighteq: '\u22ED',
	Nu: '\u039D',
	nu: '\u03BD',
	num: '\u0023',
	numero: '\u2116',
	numsp: '\u2007',
	nvap: '\u224D\u20D2',
	nVDash: '\u22AF',
	nVdash: '\u22AE',
	nvDash: '\u22AD',
	nvdash: '\u22AC',
	nvge: '\u2265\u20D2',
	nvgt: '\u003E\u20D2',
	nvHarr: '\u2904',
	nvinfin: '\u29DE',
	nvlArr: '\u2902',
	nvle: '\u2264\u20D2',
	nvlt: '\u003C\u20D2',
	nvltrie: '\u22B4\u20D2',
	nvrArr: '\u2903',
	nvrtrie: '\u22B5\u20D2',
	nvsim: '\u223C\u20D2',
	nwarhk: '\u2923',
	nwArr: '\u21D6',
	nwarr: '\u2196',
	nwarrow: '\u2196',
	nwnear: '\u2927',
	Oacute: '\u00D3',
	oacute: '\u00F3',
	oast: '\u229B',
	ocir: '\u229A',
	Ocirc: '\u00D4',
	ocirc: '\u00F4',
	Ocy: '\u041E',
	ocy: '\u043E',
	odash: '\u229D',
	Odblac: '\u0150',
	odblac: '\u0151',
	odiv: '\u2A38',
	odot: '\u2299',
	odsold: '\u29BC',
	OElig: '\u0152',
	oelig: '\u0153',
	ofcir: '\u29BF',
	Ofr: '\uD835\uDD12',
	ofr: '\uD835\uDD2C',
	ogon: '\u02DB',
	Ograve: '\u00D2',
	ograve: '\u00F2',
	ogt: '\u29C1',
	ohbar: '\u29B5',
	ohm: '\u03A9',
	oint: '\u222E',
	olarr: '\u21BA',
	olcir: '\u29BE',
	olcross: '\u29BB',
	oline: '\u203E',
	olt: '\u29C0',
	Omacr: '\u014C',
	omacr: '\u014D',
	Omega: '\u03A9',
	omega: '\u03C9',
	Omicron: '\u039F',
	omicron: '\u03BF',
	omid: '\u29B6',
	ominus: '\u2296',
	Oopf: '\uD835\uDD46',
	oopf: '\uD835\uDD60',
	opar: '\u29B7',
	OpenCurlyDoubleQuote: '\u201C',
	OpenCurlyQuote: '\u2018',
	operp: '\u29B9',
	oplus: '\u2295',
	Or: '\u2A54',
	or: '\u2228',
	orarr: '\u21BB',
	ord: '\u2A5D',
	order: '\u2134',
	orderof: '\u2134',
	ordf: '\u00AA',
	ordm: '\u00BA',
	origof: '\u22B6',
	oror: '\u2A56',
	orslope: '\u2A57',
	orv: '\u2A5B',
	oS: '\u24C8',
	Oscr: '\uD835\uDCAA',
	oscr: '\u2134',
	Oslash: '\u00D8',
	oslash: '\u00F8',
	osol: '\u2298',
	Otilde: '\u00D5',
	otilde: '\u00F5',
	Otimes: '\u2A37',
	otimes: '\u2297',
	otimesas: '\u2A36',
	Ouml: '\u00D6',
	ouml: '\u00F6',
	ovbar: '\u233D',
	OverBar: '\u203E',
	OverBrace: '\u23DE',
	OverBracket: '\u23B4',
	OverParenthesis: '\u23DC',
	par: '\u2225',
	para: '\u00B6',
	parallel: '\u2225',
	parsim: '\u2AF3',
	parsl: '\u2AFD',
	part: '\u2202',
	PartialD: '\u2202',
	Pcy: '\u041F',
	pcy: '\u043F',
	percnt: '\u0025',
	period: '\u002E',
	permil: '\u2030',
	perp: '\u22A5',
	pertenk: '\u2031',
	Pfr: '\uD835\uDD13',
	pfr: '\uD835\uDD2D',
	Phi: '\u03A6',
	phi: '\u03C6',
	phiv: '\u03D5',
	phmmat: '\u2133',
	phone: '\u260E',
	Pi: '\u03A0',
	pi: '\u03C0',
	pitchfork: '\u22D4',
	piv: '\u03D6',
	planck: '\u210F',
	planckh: '\u210E',
	plankv: '\u210F',
	plus: '\u002B',
	plusacir: '\u2A23',
	plusb: '\u229E',
	pluscir: '\u2A22',
	plusdo: '\u2214',
	plusdu: '\u2A25',
	pluse: '\u2A72',
	PlusMinus: '\u00B1',
	plusmn: '\u00B1',
	plussim: '\u2A26',
	plustwo: '\u2A27',
	pm: '\u00B1',
	Poincareplane: '\u210C',
	pointint: '\u2A15',
	Popf: '\u2119',
	popf: '\uD835\uDD61',
	pound: '\u00A3',
	Pr: '\u2ABB',
	pr: '\u227A',
	prap: '\u2AB7',
	prcue: '\u227C',
	prE: '\u2AB3',
	pre: '\u2AAF',
	prec: '\u227A',
	precapprox: '\u2AB7',
	preccurlyeq: '\u227C',
	Precedes: '\u227A',
	PrecedesEqual: '\u2AAF',
	PrecedesSlantEqual: '\u227C',
	PrecedesTilde: '\u227E',
	preceq: '\u2AAF',
	precnapprox: '\u2AB9',
	precneqq: '\u2AB5',
	precnsim: '\u22E8',
	precsim: '\u227E',
	Prime: '\u2033',
	prime: '\u2032',
	primes: '\u2119',
	prnap: '\u2AB9',
	prnE: '\u2AB5',
	prnsim: '\u22E8',
	prod: '\u220F',
	Product: '\u220F',
	profalar: '\u232E',
	profline: '\u2312',
	profsurf: '\u2313',
	prop: '\u221D',
	Proportion: '\u2237',
	Proportional: '\u221D',
	propto: '\u221D',
	prsim: '\u227E',
	prurel: '\u22B0',
	Pscr: '\uD835\uDCAB',
	pscr: '\uD835\uDCC5',
	Psi: '\u03A8',
	psi: '\u03C8',
	puncsp: '\u2008',
	Qfr: '\uD835\uDD14',
	qfr: '\uD835\uDD2E',
	qint: '\u2A0C',
	Qopf: '\u211A',
	qopf: '\uD835\uDD62',
	qprime: '\u2057',
	Qscr: '\uD835\uDCAC',
	qscr: '\uD835\uDCC6',
	quaternions: '\u210D',
	quatint: '\u2A16',
	quest: '\u003F',
	questeq: '\u225F',
	QUOT: '\u0022',
	quot: '\u0022',
	rAarr: '\u21DB',
	race: '\u223D\u0331',
	Racute: '\u0154',
	racute: '\u0155',
	radic: '\u221A',
	raemptyv: '\u29B3',
	Rang: '\u27EB',
	rang: '\u27E9',
	rangd: '\u2992',
	range: '\u29A5',
	rangle: '\u27E9',
	raquo: '\u00BB',
	Rarr: '\u21A0',
	rArr: '\u21D2',
	rarr: '\u2192',
	rarrap: '\u2975',
	rarrb: '\u21E5',
	rarrbfs: '\u2920',
	rarrc: '\u2933',
	rarrfs: '\u291E',
	rarrhk: '\u21AA',
	rarrlp: '\u21AC',
	rarrpl: '\u2945',
	rarrsim: '\u2974',
	Rarrtl: '\u2916',
	rarrtl: '\u21A3',
	rarrw: '\u219D',
	rAtail: '\u291C',
	ratail: '\u291A',
	ratio: '\u2236',
	rationals: '\u211A',
	RBarr: '\u2910',
	rBarr: '\u290F',
	rbarr: '\u290D',
	rbbrk: '\u2773',
	rbrace: '\u007D',
	rbrack: '\u005D',
	rbrke: '\u298C',
	rbrksld: '\u298E',
	rbrkslu: '\u2990',
	Rcaron: '\u0158',
	rcaron: '\u0159',
	Rcedil: '\u0156',
	rcedil: '\u0157',
	rceil: '\u2309',
	rcub: '\u007D',
	Rcy: '\u0420',
	rcy: '\u0440',
	rdca: '\u2937',
	rdldhar: '\u2969',
	rdquo: '\u201D',
	rdquor: '\u201D',
	rdsh: '\u21B3',
	Re: '\u211C',
	real: '\u211C',
	realine: '\u211B',
	realpart: '\u211C',
	reals: '\u211D',
	rect: '\u25AD',
	REG: '\u00AE',
	reg: '\u00AE',
	ReverseElement: '\u220B',
	ReverseEquilibrium: '\u21CB',
	ReverseUpEquilibrium: '\u296F',
	rfisht: '\u297D',
	rfloor: '\u230B',
	Rfr: '\u211C',
	rfr: '\uD835\uDD2F',
	rHar: '\u2964',
	rhard: '\u21C1',
	rharu: '\u21C0',
	rharul: '\u296C',
	Rho: '\u03A1',
	rho: '\u03C1',
	rhov: '\u03F1',
	RightAngleBracket: '\u27E9',
	RightArrow: '\u2192',
	Rightarrow: '\u21D2',
	rightarrow: '\u2192',
	RightArrowBar: '\u21E5',
	RightArrowLeftArrow: '\u21C4',
	rightarrowtail: '\u21A3',
	RightCeiling: '\u2309',
	RightDoubleBracket: '\u27E7',
	RightDownTeeVector: '\u295D',
	RightDownVector: '\u21C2',
	RightDownVectorBar: '\u2955',
	RightFloor: '\u230B',
	rightharpoondown: '\u21C1',
	rightharpoonup: '\u21C0',
	rightleftarrows: '\u21C4',
	rightleftharpoons: '\u21CC',
	rightrightarrows: '\u21C9',
	rightsquigarrow: '\u219D',
	RightTee: '\u22A2',
	RightTeeArrow: '\u21A6',
	RightTeeVector: '\u295B',
	rightthreetimes: '\u22CC',
	RightTriangle: '\u22B3',
	RightTriangleBar: '\u29D0',
	RightTriangleEqual: '\u22B5',
	RightUpDownVector: '\u294F',
	RightUpTeeVector: '\u295C',
	RightUpVector: '\u21BE',
	RightUpVectorBar: '\u2954',
	RightVector: '\u21C0',
	RightVectorBar: '\u2953',
	ring: '\u02DA',
	risingdotseq: '\u2253',
	rlarr: '\u21C4',
	rlhar: '\u21CC',
	rlm: '\u200F',
	rmoust: '\u23B1',
	rmoustache: '\u23B1',
	rnmid: '\u2AEE',
	roang: '\u27ED',
	roarr: '\u21FE',
	robrk: '\u27E7',
	ropar: '\u2986',
	Ropf: '\u211D',
	ropf: '\uD835\uDD63',
	roplus: '\u2A2E',
	rotimes: '\u2A35',
	RoundImplies: '\u2970',
	rpar: '\u0029',
	rpargt: '\u2994',
	rppolint: '\u2A12',
	rrarr: '\u21C9',
	Rrightarrow: '\u21DB',
	rsaquo: '\u203A',
	Rscr: '\u211B',
	rscr: '\uD835\uDCC7',
	Rsh: '\u21B1',
	rsh: '\u21B1',
	rsqb: '\u005D',
	rsquo: '\u2019',
	rsquor: '\u2019',
	rthree: '\u22CC',
	rtimes: '\u22CA',
	rtri: '\u25B9',
	rtrie: '\u22B5',
	rtrif: '\u25B8',
	rtriltri: '\u29CE',
	RuleDelayed: '\u29F4',
	ruluhar: '\u2968',
	rx: '\u211E',
	Sacute: '\u015A',
	sacute: '\u015B',
	sbquo: '\u201A',
	Sc: '\u2ABC',
	sc: '\u227B',
	scap: '\u2AB8',
	Scaron: '\u0160',
	scaron: '\u0161',
	sccue: '\u227D',
	scE: '\u2AB4',
	sce: '\u2AB0',
	Scedil: '\u015E',
	scedil: '\u015F',
	Scirc: '\u015C',
	scirc: '\u015D',
	scnap: '\u2ABA',
	scnE: '\u2AB6',
	scnsim: '\u22E9',
	scpolint: '\u2A13',
	scsim: '\u227F',
	Scy: '\u0421',
	scy: '\u0441',
	sdot: '\u22C5',
	sdotb: '\u22A1',
	sdote: '\u2A66',
	searhk: '\u2925',
	seArr: '\u21D8',
	searr: '\u2198',
	searrow: '\u2198',
	sect: '\u00A7',
	semi: '\u003B',
	seswar: '\u2929',
	setminus: '\u2216',
	setmn: '\u2216',
	sext: '\u2736',
	Sfr: '\uD835\uDD16',
	sfr: '\uD835\uDD30',
	sfrown: '\u2322',
	sharp: '\u266F',
	SHCHcy: '\u0429',
	shchcy: '\u0449',
	SHcy: '\u0428',
	shcy: '\u0448',
	ShortDownArrow: '\u2193',
	ShortLeftArrow: '\u2190',
	shortmid: '\u2223',
	shortparallel: '\u2225',
	ShortRightArrow: '\u2192',
	ShortUpArrow: '\u2191',
	shy: '\u00AD',
	Sigma: '\u03A3',
	sigma: '\u03C3',
	sigmaf: '\u03C2',
	sigmav: '\u03C2',
	sim: '\u223C',
	simdot: '\u2A6A',
	sime: '\u2243',
	simeq: '\u2243',
	simg: '\u2A9E',
	simgE: '\u2AA0',
	siml: '\u2A9D',
	simlE: '\u2A9F',
	simne: '\u2246',
	simplus: '\u2A24',
	simrarr: '\u2972',
	slarr: '\u2190',
	SmallCircle: '\u2218',
	smallsetminus: '\u2216',
	smashp: '\u2A33',
	smeparsl: '\u29E4',
	smid: '\u2223',
	smile: '\u2323',
	smt: '\u2AAA',
	smte: '\u2AAC',
	smtes: '\u2AAC\uFE00',
	SOFTcy: '\u042C',
	softcy: '\u044C',
	sol: '\u002F',
	solb: '\u29C4',
	solbar: '\u233F',
	Sopf: '\uD835\uDD4A',
	sopf: '\uD835\uDD64',
	spades: '\u2660',
	spadesuit: '\u2660',
	spar: '\u2225',
	sqcap: '\u2293',
	sqcaps: '\u2293\uFE00',
	sqcup: '\u2294',
	sqcups: '\u2294\uFE00',
	Sqrt: '\u221A',
	sqsub: '\u228F',
	sqsube: '\u2291',
	sqsubset: '\u228F',
	sqsubseteq: '\u2291',
	sqsup: '\u2290',
	sqsupe: '\u2292',
	sqsupset: '\u2290',
	sqsupseteq: '\u2292',
	squ: '\u25A1',
	Square: '\u25A1',
	square: '\u25A1',
	SquareIntersection: '\u2293',
	SquareSubset: '\u228F',
	SquareSubsetEqual: '\u2291',
	SquareSuperset: '\u2290',
	SquareSupersetEqual: '\u2292',
	SquareUnion: '\u2294',
	squarf: '\u25AA',
	squf: '\u25AA',
	srarr: '\u2192',
	Sscr: '\uD835\uDCAE',
	sscr: '\uD835\uDCC8',
	ssetmn: '\u2216',
	ssmile: '\u2323',
	sstarf: '\u22C6',
	Star: '\u22C6',
	star: '\u2606',
	starf: '\u2605',
	straightepsilon: '\u03F5',
	straightphi: '\u03D5',
	strns: '\u00AF',
	Sub: '\u22D0',
	sub: '\u2282',
	subdot: '\u2ABD',
	subE: '\u2AC5',
	sube: '\u2286',
	subedot: '\u2AC3',
	submult: '\u2AC1',
	subnE: '\u2ACB',
	subne: '\u228A',
	subplus: '\u2ABF',
	subrarr: '\u2979',
	Subset: '\u22D0',
	subset: '\u2282',
	subseteq: '\u2286',
	subseteqq: '\u2AC5',
	SubsetEqual: '\u2286',
	subsetneq: '\u228A',
	subsetneqq: '\u2ACB',
	subsim: '\u2AC7',
	subsub: '\u2AD5',
	subsup: '\u2AD3',
	succ: '\u227B',
	succapprox: '\u2AB8',
	succcurlyeq: '\u227D',
	Succeeds: '\u227B',
	SucceedsEqual: '\u2AB0',
	SucceedsSlantEqual: '\u227D',
	SucceedsTilde: '\u227F',
	succeq: '\u2AB0',
	succnapprox: '\u2ABA',
	succneqq: '\u2AB6',
	succnsim: '\u22E9',
	succsim: '\u227F',
	SuchThat: '\u220B',
	Sum: '\u2211',
	sum: '\u2211',
	sung: '\u266A',
	Sup: '\u22D1',
	sup: '\u2283',
	sup1: '\u00B9',
	sup2: '\u00B2',
	sup3: '\u00B3',
	supdot: '\u2ABE',
	supdsub: '\u2AD8',
	supE: '\u2AC6',
	supe: '\u2287',
	supedot: '\u2AC4',
	Superset: '\u2283',
	SupersetEqual: '\u2287',
	suphsol: '\u27C9',
	suphsub: '\u2AD7',
	suplarr: '\u297B',
	supmult: '\u2AC2',
	supnE: '\u2ACC',
	supne: '\u228B',
	supplus: '\u2AC0',
	Supset: '\u22D1',
	supset: '\u2283',
	supseteq: '\u2287',
	supseteqq: '\u2AC6',
	supsetneq: '\u228B',
	supsetneqq: '\u2ACC',
	supsim: '\u2AC8',
	supsub: '\u2AD4',
	supsup: '\u2AD6',
	swarhk: '\u2926',
	swArr: '\u21D9',
	swarr: '\u2199',
	swarrow: '\u2199',
	swnwar: '\u292A',
	szlig: '\u00DF',
	Tab: '\u0009',
	target: '\u2316',
	Tau: '\u03A4',
	tau: '\u03C4',
	tbrk: '\u23B4',
	Tcaron: '\u0164',
	tcaron: '\u0165',
	Tcedil: '\u0162',
	tcedil: '\u0163',
	Tcy: '\u0422',
	tcy: '\u0442',
	tdot: '\u20DB',
	telrec: '\u2315',
	Tfr: '\uD835\uDD17',
	tfr: '\uD835\uDD31',
	there4: '\u2234',
	Therefore: '\u2234',
	therefore: '\u2234',
	Theta: '\u0398',
	theta: '\u03B8',
	thetasym: '\u03D1',
	thetav: '\u03D1',
	thickapprox: '\u2248',
	thicksim: '\u223C',
	ThickSpace: '\u205F\u200A',
	thinsp: '\u2009',
	ThinSpace: '\u2009',
	thkap: '\u2248',
	thksim: '\u223C',
	THORN: '\u00DE',
	thorn: '\u00FE',
	Tilde: '\u223C',
	tilde: '\u02DC',
	TildeEqual: '\u2243',
	TildeFullEqual: '\u2245',
	TildeTilde: '\u2248',
	times: '\u00D7',
	timesb: '\u22A0',
	timesbar: '\u2A31',
	timesd: '\u2A30',
	tint: '\u222D',
	toea: '\u2928',
	top: '\u22A4',
	topbot: '\u2336',
	topcir: '\u2AF1',
	Topf: '\uD835\uDD4B',
	topf: '\uD835\uDD65',
	topfork: '\u2ADA',
	tosa: '\u2929',
	tprime: '\u2034',
	TRADE: '\u2122',
	trade: '\u2122',
	triangle: '\u25B5',
	triangledown: '\u25BF',
	triangleleft: '\u25C3',
	trianglelefteq: '\u22B4',
	triangleq: '\u225C',
	triangleright: '\u25B9',
	trianglerighteq: '\u22B5',
	tridot: '\u25EC',
	trie: '\u225C',
	triminus: '\u2A3A',
	TripleDot: '\u20DB',
	triplus: '\u2A39',
	trisb: '\u29CD',
	tritime: '\u2A3B',
	trpezium: '\u23E2',
	Tscr: '\uD835\uDCAF',
	tscr: '\uD835\uDCC9',
	TScy: '\u0426',
	tscy: '\u0446',
	TSHcy: '\u040B',
	tshcy: '\u045B',
	Tstrok: '\u0166',
	tstrok: '\u0167',
	twixt: '\u226C',
	twoheadleftarrow: '\u219E',
	twoheadrightarrow: '\u21A0',
	Uacute: '\u00DA',
	uacute: '\u00FA',
	Uarr: '\u219F',
	uArr: '\u21D1',
	uarr: '\u2191',
	Uarrocir: '\u2949',
	Ubrcy: '\u040E',
	ubrcy: '\u045E',
	Ubreve: '\u016C',
	ubreve: '\u016D',
	Ucirc: '\u00DB',
	ucirc: '\u00FB',
	Ucy: '\u0423',
	ucy: '\u0443',
	udarr: '\u21C5',
	Udblac: '\u0170',
	udblac: '\u0171',
	udhar: '\u296E',
	ufisht: '\u297E',
	Ufr: '\uD835\uDD18',
	ufr: '\uD835\uDD32',
	Ugrave: '\u00D9',
	ugrave: '\u00F9',
	uHar: '\u2963',
	uharl: '\u21BF',
	uharr: '\u21BE',
	uhblk: '\u2580',
	ulcorn: '\u231C',
	ulcorner: '\u231C',
	ulcrop: '\u230F',
	ultri: '\u25F8',
	Umacr: '\u016A',
	umacr: '\u016B',
	uml: '\u00A8',
	UnderBar: '\u005F',
	UnderBrace: '\u23DF',
	UnderBracket: '\u23B5',
	UnderParenthesis: '\u23DD',
	Union: '\u22C3',
	UnionPlus: '\u228E',
	Uogon: '\u0172',
	uogon: '\u0173',
	Uopf: '\uD835\uDD4C',
	uopf: '\uD835\uDD66',
	UpArrow: '\u2191',
	Uparrow: '\u21D1',
	uparrow: '\u2191',
	UpArrowBar: '\u2912',
	UpArrowDownArrow: '\u21C5',
	UpDownArrow: '\u2195',
	Updownarrow: '\u21D5',
	updownarrow: '\u2195',
	UpEquilibrium: '\u296E',
	upharpoonleft: '\u21BF',
	upharpoonright: '\u21BE',
	uplus: '\u228E',
	UpperLeftArrow: '\u2196',
	UpperRightArrow: '\u2197',
	Upsi: '\u03D2',
	upsi: '\u03C5',
	upsih: '\u03D2',
	Upsilon: '\u03A5',
	upsilon: '\u03C5',
	UpTee: '\u22A5',
	UpTeeArrow: '\u21A5',
	upuparrows: '\u21C8',
	urcorn: '\u231D',
	urcorner: '\u231D',
	urcrop: '\u230E',
	Uring: '\u016E',
	uring: '\u016F',
	urtri: '\u25F9',
	Uscr: '\uD835\uDCB0',
	uscr: '\uD835\uDCCA',
	utdot: '\u22F0',
	Utilde: '\u0168',
	utilde: '\u0169',
	utri: '\u25B5',
	utrif: '\u25B4',
	uuarr: '\u21C8',
	Uuml: '\u00DC',
	uuml: '\u00FC',
	uwangle: '\u29A7',
	vangrt: '\u299C',
	varepsilon: '\u03F5',
	varkappa: '\u03F0',
	varnothing: '\u2205',
	varphi: '\u03D5',
	varpi: '\u03D6',
	varpropto: '\u221D',
	vArr: '\u21D5',
	varr: '\u2195',
	varrho: '\u03F1',
	varsigma: '\u03C2',
	varsubsetneq: '\u228A\uFE00',
	varsubsetneqq: '\u2ACB\uFE00',
	varsupsetneq: '\u228B\uFE00',
	varsupsetneqq: '\u2ACC\uFE00',
	vartheta: '\u03D1',
	vartriangleleft: '\u22B2',
	vartriangleright: '\u22B3',
	Vbar: '\u2AEB',
	vBar: '\u2AE8',
	vBarv: '\u2AE9',
	Vcy: '\u0412',
	vcy: '\u0432',
	VDash: '\u22AB',
	Vdash: '\u22A9',
	vDash: '\u22A8',
	vdash: '\u22A2',
	Vdashl: '\u2AE6',
	Vee: '\u22C1',
	vee: '\u2228',
	veebar: '\u22BB',
	veeeq: '\u225A',
	vellip: '\u22EE',
	Verbar: '\u2016',
	verbar: '\u007C',
	Vert: '\u2016',
	vert: '\u007C',
	VerticalBar: '\u2223',
	VerticalLine: '\u007C',
	VerticalSeparator: '\u2758',
	VerticalTilde: '\u2240',
	VeryThinSpace: '\u200A',
	Vfr: '\uD835\uDD19',
	vfr: '\uD835\uDD33',
	vltri: '\u22B2',
	vnsub: '\u2282\u20D2',
	vnsup: '\u2283\u20D2',
	Vopf: '\uD835\uDD4D',
	vopf: '\uD835\uDD67',
	vprop: '\u221D',
	vrtri: '\u22B3',
	Vscr: '\uD835\uDCB1',
	vscr: '\uD835\uDCCB',
	vsubnE: '\u2ACB\uFE00',
	vsubne: '\u228A\uFE00',
	vsupnE: '\u2ACC\uFE00',
	vsupne: '\u228B\uFE00',
	Vvdash: '\u22AA',
	vzigzag: '\u299A',
	Wcirc: '\u0174',
	wcirc: '\u0175',
	wedbar: '\u2A5F',
	Wedge: '\u22C0',
	wedge: '\u2227',
	wedgeq: '\u2259',
	weierp: '\u2118',
	Wfr: '\uD835\uDD1A',
	wfr: '\uD835\uDD34',
	Wopf: '\uD835\uDD4E',
	wopf: '\uD835\uDD68',
	wp: '\u2118',
	wr: '\u2240',
	wreath: '\u2240',
	Wscr: '\uD835\uDCB2',
	wscr: '\uD835\uDCCC',
	xcap: '\u22C2',
	xcirc: '\u25EF',
	xcup: '\u22C3',
	xdtri: '\u25BD',
	Xfr: '\uD835\uDD1B',
	xfr: '\uD835\uDD35',
	xhArr: '\u27FA',
	xharr: '\u27F7',
	Xi: '\u039E',
	xi: '\u03BE',
	xlArr: '\u27F8',
	xlarr: '\u27F5',
	xmap: '\u27FC',
	xnis: '\u22FB',
	xodot: '\u2A00',
	Xopf: '\uD835\uDD4F',
	xopf: '\uD835\uDD69',
	xoplus: '\u2A01',
	xotime: '\u2A02',
	xrArr: '\u27F9',
	xrarr: '\u27F6',
	Xscr: '\uD835\uDCB3',
	xscr: '\uD835\uDCCD',
	xsqcup: '\u2A06',
	xuplus: '\u2A04',
	xutri: '\u25B3',
	xvee: '\u22C1',
	xwedge: '\u22C0',
	Yacute: '\u00DD',
	yacute: '\u00FD',
	YAcy: '\u042F',
	yacy: '\u044F',
	Ycirc: '\u0176',
	ycirc: '\u0177',
	Ycy: '\u042B',
	ycy: '\u044B',
	yen: '\u00A5',
	Yfr: '\uD835\uDD1C',
	yfr: '\uD835\uDD36',
	YIcy: '\u0407',
	yicy: '\u0457',
	Yopf: '\uD835\uDD50',
	yopf: '\uD835\uDD6A',
	Yscr: '\uD835\uDCB4',
	yscr: '\uD835\uDCCE',
	YUcy: '\u042E',
	yucy: '\u044E',
	Yuml: '\u0178',
	yuml: '\u00FF',
	Zacute: '\u0179',
	zacute: '\u017A',
	Zcaron: '\u017D',
	zcaron: '\u017E',
	Zcy: '\u0417',
	zcy: '\u0437',
	Zdot: '\u017B',
	zdot: '\u017C',
	zeetrf: '\u2128',
	ZeroWidthSpace: '\u200B',
	Zeta: '\u0396',
	zeta: '\u03B6',
	Zfr: '\u2128',
	zfr: '\uD835\uDD37',
	ZHcy: '\u0416',
	zhcy: '\u0436',
	zigrarr: '\u21DD',
	Zopf: '\u2124',
	zopf: '\uD835\uDD6B',
	Zscr: '\uD835\uDCB5',
	zscr: '\uD835\uDCCF',
	zwj: '\u200D',
	zwnj: '\u200C',
});

/**
 * @deprecated
 * Use `HTML_ENTITIES` instead.
 * @see {@link HTML_ENTITIES}
 */
exports.entityMap = exports.HTML_ENTITIES;

},{"./conventions":2}],6:[function(require,module,exports){
'use strict';

var conventions = require('./conventions');

function extendError(constructor, writableName) {
	constructor.prototype = Object.create(Error.prototype, {
		constructor: { value: constructor },
		name: { value: constructor.name, enumerable: true, writable: writableName },
	});
}

var DOMExceptionName = conventions.freeze({
	/**
	 * the default value as defined by the spec
	 */
	Error: 'Error',
	/**
	 * @deprecated
	 * Use RangeError instead.
	 */
	IndexSizeError: 'IndexSizeError',
	/**
	 * @deprecated
	 * Just to match the related static code, not part of the spec.
	 */
	DomstringSizeError: 'DomstringSizeError',
	HierarchyRequestError: 'HierarchyRequestError',
	WrongDocumentError: 'WrongDocumentError',
	InvalidCharacterError: 'InvalidCharacterError',
	/**
	 * @deprecated
	 * Just to match the related static code, not part of the spec.
	 */
	NoDataAllowedError: 'NoDataAllowedError',
	NoModificationAllowedError: 'NoModificationAllowedError',
	NotFoundError: 'NotFoundError',
	NotSupportedError: 'NotSupportedError',
	InUseAttributeError: 'InUseAttributeError',
	InvalidStateError: 'InvalidStateError',
	SyntaxError: 'SyntaxError',
	InvalidModificationError: 'InvalidModificationError',
	NamespaceError: 'NamespaceError',
	/**
	 * @deprecated
	 * Use TypeError for invalid arguments,
	 * "NotSupportedError" DOMException for unsupported operations,
	 * and "NotAllowedError" DOMException for denied requests instead.
	 */
	InvalidAccessError: 'InvalidAccessError',
	/**
	 * @deprecated
	 * Just to match the related static code, not part of the spec.
	 */
	ValidationError: 'ValidationError',
	/**
	 * @deprecated
	 * Use TypeError instead.
	 */
	TypeMismatchError: 'TypeMismatchError',
	SecurityError: 'SecurityError',
	NetworkError: 'NetworkError',
	AbortError: 'AbortError',
	/**
	 * @deprecated
	 * Just to match the related static code, not part of the spec.
	 */
	URLMismatchError: 'URLMismatchError',
	QuotaExceededError: 'QuotaExceededError',
	TimeoutError: 'TimeoutError',
	InvalidNodeTypeError: 'InvalidNodeTypeError',
	DataCloneError: 'DataCloneError',
	EncodingError: 'EncodingError',
	NotReadableError: 'NotReadableError',
	UnknownError: 'UnknownError',
	ConstraintError: 'ConstraintError',
	DataError: 'DataError',
	TransactionInactiveError: 'TransactionInactiveError',
	ReadOnlyError: 'ReadOnlyError',
	VersionError: 'VersionError',
	OperationError: 'OperationError',
	NotAllowedError: 'NotAllowedError',
	OptOutError: 'OptOutError',
});
var DOMExceptionNames = Object.keys(DOMExceptionName);

function isValidDomExceptionCode(value) {
	return typeof value === 'number' && value >= 1 && value <= 25;
}
function endsWithError(value) {
	return typeof value === 'string' && value.substring(value.length - DOMExceptionName.Error.length) === DOMExceptionName.Error;
}
/**
 * DOM operations only raise exceptions in "exceptional" circumstances, i.e., when an operation
 * is impossible to perform (either for logical reasons, because data is lost, or because the
 * implementation has become unstable). In general, DOM methods return specific error values in
 * ordinary processing situations, such as out-of-bound errors when using NodeList.
 *
 * Implementations should raise other exceptions under other circumstances. For example,
 * implementations should raise an implementation-dependent exception if a null argument is
 * passed when null was not expected.
 *
 * This implementation supports the following usages:
 * 1. according to the living standard (both arguments are optional):
 * ```
 * new DOMException("message (can be empty)", DOMExceptionNames.HierarchyRequestError)
 * ```
 * 2. according to previous xmldom implementation (only the first argument is required):
 * ```
 * new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "optional message")
 * ```
 * both result in the proper name being set.
 *
 * @class DOMException
 * @param {number | string} messageOrCode
 * The reason why an operation is not acceptable.
 * If it is a number, it is used to determine the `name`, see
 * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-258A00AF ExceptionCode}
 * @param {string | keyof typeof DOMExceptionName | Error} [nameOrMessage]
 * The `name` to use for the error.
 * If `messageOrCode` is a number, this arguments is used as the `message` instead.
 * @augments Error
 * @see https://webidl.spec.whatwg.org/#idl-DOMException
 * @see https://webidl.spec.whatwg.org/#dfn-error-names-table
 * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-17189187
 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/ecma-script-binding.html
 * @see http://www.w3.org/TR/REC-DOM-Level-1/ecma-script-language-binding.html
 */
function DOMException(messageOrCode, nameOrMessage) {
	// support old way of passing arguments: first argument is a valid number
	if (isValidDomExceptionCode(messageOrCode)) {
		this.name = DOMExceptionNames[messageOrCode];
		this.message = nameOrMessage || '';
	} else {
		this.message = messageOrCode;
		this.name = endsWithError(nameOrMessage) ? nameOrMessage : DOMExceptionName.Error;
	}
	if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
}
extendError(DOMException, true);
Object.defineProperties(DOMException.prototype, {
	code: {
		enumerable: true,
		get: function () {
			var code = DOMExceptionNames.indexOf(this.name);
			if (isValidDomExceptionCode(code)) return code;
			return 0;
		},
	},
});

var ExceptionCode = {
	INDEX_SIZE_ERR: 1,
	DOMSTRING_SIZE_ERR: 2,
	HIERARCHY_REQUEST_ERR: 3,
	WRONG_DOCUMENT_ERR: 4,
	INVALID_CHARACTER_ERR: 5,
	NO_DATA_ALLOWED_ERR: 6,
	NO_MODIFICATION_ALLOWED_ERR: 7,
	NOT_FOUND_ERR: 8,
	NOT_SUPPORTED_ERR: 9,
	INUSE_ATTRIBUTE_ERR: 10,
	INVALID_STATE_ERR: 11,
	SYNTAX_ERR: 12,
	INVALID_MODIFICATION_ERR: 13,
	NAMESPACE_ERR: 14,
	INVALID_ACCESS_ERR: 15,
	VALIDATION_ERR: 16,
	TYPE_MISMATCH_ERR: 17,
	SECURITY_ERR: 18,
	NETWORK_ERR: 19,
	ABORT_ERR: 20,
	URL_MISMATCH_ERR: 21,
	QUOTA_EXCEEDED_ERR: 22,
	TIMEOUT_ERR: 23,
	INVALID_NODE_TYPE_ERR: 24,
	DATA_CLONE_ERR: 25,
};

var entries = Object.entries(ExceptionCode);
for (var i = 0; i < entries.length; i++) {
	var key = entries[i][0];
	DOMException[key] = entries[i][1];
}

/**
 * Creates an error that will not be caught by XMLReader aka the SAX parser.
 *
 * @class
 * @param {string} message
 * @param {any} [locator]
 * @param {Error} [cause]
 * The error that caused this one, e.g. a `DOMException` thrown while building the DOM.
 */
function ParseError(message, locator, cause) {
	this.message = message;
	this.locator = locator;
	this.cause = cause;
	if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
}
extendError(ParseError);

exports.DOMException = DOMException;
exports.DOMExceptionName = DOMExceptionName;
exports.ExceptionCode = ExceptionCode;
exports.ParseError = ParseError;

},{"./conventions":2}],7:[function(require,module,exports){
'use strict';

/**
 * Detects relevant unicode support for regular expressions in the runtime.
 * Should the runtime not accepts the flag `u` or unicode ranges,
 * character classes without unicode handling will be used.
 *
 * @param {typeof RegExp} [RegExpImpl=RegExp]
 * For testing: the RegExp class.
 * @returns {boolean}
 * @see https://node.green/#ES2015-syntax-RegExp--y--and--u--flags
 */
function detectUnicodeSupport(RegExpImpl) {
	try {
		if (typeof RegExpImpl !== 'function') {
			RegExpImpl = RegExp;
		}
		// eslint-disable-next-line es5/no-unicode-regex,es5/no-unicode-code-point-escape
		var match = new RegExpImpl('\u{1d306}', 'u').exec('𝌆');
		return !!match && match[0].length === 2;
	} catch (error) {}
	return false;
}
var UNICODE_SUPPORT = detectUnicodeSupport();

/**
 * Removes `[`, `]` and any trailing quantifiers from the source of a RegExp.
 *
 * @param {RegExp} regexp
 */
function chars(regexp) {
	if (regexp.source[0] !== '[') {
		throw new Error(regexp + ' can not be used with chars');
	}
	return regexp.source.slice(1, regexp.source.lastIndexOf(']'));
}

/**
 * Creates a new character list regular expression,
 * by removing `search` from the source of `regexp`.
 *
 * @param {RegExp} regexp
 * @param {string} search
 * The character(s) to remove.
 * @returns {RegExp}
 */
function chars_without(regexp, search) {
	if (regexp.source[0] !== '[') {
		throw new Error('/' + regexp.source + '/ can not be used with chars_without');
	}
	if (!search || typeof search !== 'string') {
		throw new Error(JSON.stringify(search) + ' is not a valid search');
	}
	if (regexp.source.indexOf(search) === -1) {
		throw new Error('"' + search + '" is not is /' + regexp.source + '/');
	}
	if (search === '-' && regexp.source.indexOf(search) !== 1) {
		throw new Error('"' + search + '" is not at the first postion of /' + regexp.source + '/');
	}
	return new RegExp(regexp.source.replace(search, ''), UNICODE_SUPPORT ? 'u' : '');
}

/**
 * Combines and Regular expressions correctly by using `RegExp.source`.
 *
 * @param {...(RegExp | string)[]} args
 * @returns {RegExp}
 */
function reg(args) {
	var self = this;
	return new RegExp(
		Array.prototype.slice
			.call(arguments)
			.map(function (part) {
				var isStr = typeof part === 'string';
				if (isStr && self === undefined && part === '|') {
					throw new Error('use regg instead of reg to wrap expressions with `|`!');
				}
				return isStr ? part : part.source;
			})
			.join(''),
		UNICODE_SUPPORT ? 'u' : ''
	);
}

/**
 * Like `reg` but wraps the expression in `(?:`,`)` to create a non tracking group.
 *
 * @param {...(RegExp | string)[]} args
 * @returns {RegExp}
 */
function regg(args) {
	if (arguments.length === 0) {
		throw new Error('no parameters provided');
	}
	return reg.apply(regg, ['(?:'].concat(Array.prototype.slice.call(arguments), [')']));
}

// /**
//  * Append ^ to the beginning of the expression.
//  * @param {...(RegExp | string)[]} args
//  * @returns {RegExp}
//  */
// function reg_start(args) {
// 	if (arguments.length === 0) {
// 		throw new Error('no parameters provided');
// 	}
// 	return reg.apply(reg_start, ['^'].concat(Array.prototype.slice.call(arguments)));
// }

// https://www.w3.org/TR/xml/#document
// `[1] document ::= prolog element Misc*`
// https://www.w3.org/TR/xml11/#NT-document
// `[1] document ::= ( prolog element Misc* ) - ( Char* RestrictedChar Char* )`

/**
 * A character usually appearing in wrongly converted strings.
 *
 * @type {string}
 * @see https://en.wikipedia.org/wiki/Specials_(Unicode_block)#Replacement_character
 * @see https://nodejs.dev/en/api/v18/buffer/#buffers-and-character-encodings
 * @see https://www.unicode.org/faq/utf_bom.html#BOM
 * @readonly
 */
var UNICODE_REPLACEMENT_CHARACTER = '\uFFFD';
// https://www.w3.org/TR/xml/#NT-Char
// any Unicode character, excluding the surrogate blocks, FFFE, and FFFF.
// `[2] Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`
// https://www.w3.org/TR/xml11/#NT-Char
// `[2] Char ::= [#x1-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`
// https://www.w3.org/TR/xml11/#NT-RestrictedChar
// `[2a] RestrictedChar ::= [#x1-#x8] | [#xB-#xC] | [#xE-#x1F] | [#x7F-#x84] | [#x86-#x9F]`
// https://www.w3.org/TR/xml11/#charsets
var Char = /[-\x09\x0A\x0D\x20-\x2C\x2E-\uD7FF\uE000-\uFFFD]/; // without \u10000-\uEFFFF
if (UNICODE_SUPPORT) {
	// eslint-disable-next-line es5/no-unicode-code-point-escape
	Char = reg('[', chars(Char), '\\u{10000}-\\u{10FFFF}', ']');
}
// Negation of Char: matches any character that is NOT a valid XML 1.0 Char.
// Derived directly from the Char character class above (after the unicode-support extension).
// XML 1.0 Char production [2]: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
// @see https://www.w3.org/TR/xml/#NT-Char
var InvalidChar = new RegExp('[^' + chars(Char) + ']', UNICODE_SUPPORT ? 'u' : '');

var _SChar = /[\x20\x09\x0D\x0A]/;
var SChar_s = chars(_SChar);
// https://www.w3.org/TR/xml11/#NT-S
// `[3] S ::= (#x20 | #x9 | #xD | #xA)+`
var S = reg(_SChar, '+');
// optional whitespace described as `S?` in the grammar,
// simplified to 0-n occurrences of the character class
// instead of 0-1 occurrences of a non-capturing group around S
var S_OPT = reg(_SChar, '*');

// https://www.w3.org/TR/xml11/#NT-NameStartChar
// `[4] NameStartChar ::= ":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]`
var NameStartChar =
	/[:_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/; // without \u10000-\uEFFFF
if (UNICODE_SUPPORT) {
	// eslint-disable-next-line es5/no-unicode-code-point-escape
	NameStartChar = reg('[', chars(NameStartChar), '\\u{10000}-\\u{10FFFF}', ']');
}
var NameStartChar_s = chars(NameStartChar);

// https://www.w3.org/TR/xml11/#NT-NameChar
// `[4a] NameChar ::= NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]`
var NameChar = reg('[', NameStartChar_s, chars(/[-.0-9\xB7]/), chars(/[\u0300-\u036F\u203F-\u2040]/), ']');
// https://www.w3.org/TR/xml11/#NT-Name
// `[5] Name ::= NameStartChar (NameChar)*`
var Name = reg(NameStartChar, NameChar, '*');
// Full-string anchored matcher for requireWellFormed serializer checks
// https://w3c.github.io/DOM-Parsing/#xml-serializing-a-document-node
var Name_exact = reg('^', Name, '$');
/*
https://www.w3.org/TR/xml11/#NT-Names
`[6] Names ::= Name (#x20 Name)*`
*/

// https://www.w3.org/TR/xml11/#NT-Nmtoken
// `[7] Nmtoken ::= (NameChar)+`
var Nmtoken = reg(NameChar, '+');
/*
https://www.w3.org/TR/xml11/#NT-Nmtokens
`[8] Nmtokens ::= Nmtoken (#x20 Nmtoken)*`
var Nmtokens = reg(Nmtoken, regg(/\x20/, Nmtoken), '*');
*/

// https://www.w3.org/TR/xml11/#NT-EntityRef
// `[68] EntityRef ::= '&' Name ';'` [WFC: Entity Declared] [VC: Entity Declared] [WFC: Parsed Entity] [WFC: No Recursion]
var EntityRef = reg('&', Name, ';');
// https://www.w3.org/TR/xml11/#NT-CharRef
// `[66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'` [WFC: Legal Character]
var CharRef = regg(/&#[0-9]+;|&#x[0-9a-fA-F]+;/);

/*
https://www.w3.org/TR/xml11/#NT-Reference
- `[67] Reference ::= EntityRef | CharRef`
- `[66] CharRef ::= '&#' [0-9]+ ';' | '&#x' [0-9a-fA-F]+ ';'` [WFC: Legal Character]
- `[68] EntityRef ::= '&' Name ';'` [WFC: Entity Declared] [VC: Entity Declared] [WFC: Parsed Entity] [WFC: No Recursion]
*/
var Reference = regg(EntityRef, '|', CharRef);

// https://www.w3.org/TR/xml11/#NT-PEReference
// `[69] PEReference ::= '%' Name ';'`
// [VC: Entity Declared] [WFC: No Recursion] [WFC: In DTD]
var PEReference = reg('%', Name, ';');

// https://www.w3.org/TR/xml11/#NT-EntityValue
// `[9] EntityValue ::= '"' ([^%&"] | PEReference | Reference)* '"' | "'" ([^%&'] | PEReference | Reference)* "'"`
var EntityValue = regg(
	reg('"', regg(/[^%&"]/, '|', PEReference, '|', Reference), '*', '"'),
	'|',
	reg("'", regg(/[^%&']/, '|', PEReference, '|', Reference), '*', "'")
);

// https://www.w3.org/TR/xml11/#NT-AttValue
// `[10] AttValue ::= '"' ([^<&"] | Reference)* '"' | "'" ([^<&'] | Reference)* "'"`
var AttValue = regg('"', regg(/[^<&"]/, '|', Reference), '*', '"', '|', "'", regg(/[^<&']/, '|', Reference), '*', "'");

// https://www.w3.org/TR/xml-names/#ns-decl
// https://www.w3.org/TR/xml-names/#ns-qualnames
// NameStartChar without ":"
var NCNameStartChar = chars_without(NameStartChar, ':');
// https://www.w3.org/TR/xml-names/#orphans
// `[5] NCNameChar ::= NameChar - ':'`
// An XML NameChar, minus the ":"
var NCNameChar = chars_without(NameChar, ':');
// https://www.w3.org/TR/xml-names/#NT-NCName
// `[4] NCName ::= Name - (Char* ':' Char*)`
// An XML Name, minus the ":"
var NCName = reg(NCNameStartChar, NCNameChar, '*');
// Full-string anchored matcher for requireWellFormed serializer checks
// https://w3c.github.io/DOM-Parsing/#xml-serializing-a-document-node
var NCName_exact = reg('^', NCName, '$');

/**
https://www.w3.org/TR/xml-names/#ns-qualnames

```
[7] QName ::= PrefixedName | UnprefixedName
				  === (NCName ':' NCName) | NCName
				  === NCName (':' NCName)?
[8] PrefixedName ::= Prefix ':' LocalPart
								 === NCName ':' NCName
[9] UnprefixedName ::= LocalPart
									 === NCName
[10] Prefix ::= NCName
[11] LocalPart ::= NCName
```
*/
var QName = reg(NCName, regg(':', NCName), '?');
var QName_exact = reg('^', QName, '$');
var QName_group = reg('(', QName, ')');

// https://www.w3.org/TR/xml11/#NT-SystemLiteral
// `[11] SystemLiteral ::= ('"' [^"]* '"') | ("'" [^']* "'")`
var SystemLiteral = regg(/"[^"]*"|'[^']*'/);

/*
 https://www.w3.org/TR/xml11/#NT-PI
 ```
 [17] PITarget    ::= Name - (('X' | 'x') ('M' | 'm') ('L' | 'l'))
 [16] PI    ::= '<?' PITarget (S (Char* - (Char* '?>' Char*)))? '?>'
 ```
 target /xml/i is not excluded!
*/
// The `(?!S)` after the leading `S+` asserts the data starts with a non-whitespace
// character (greedy `S+` already consumes all separating whitespace), pruning the
// `S+`/`Char*?` whitespace overlap that otherwise makes an unterminated PI (no `?>`)
// backtrack quadratically. The lookahead is non-capturing, so the data stays group 2.
var PI = reg(/^<\?/, '(', Name, ')', regg(S, '(?!', _SChar, ')(', Char, '*?)'), '?', /\?>/);

// https://www.w3.org/TR/xml11/#NT-PubidChar
// `[13] PubidChar ::= #x20 | #xD | #xA | [a-zA-Z0-9] | [-'()+,./:=?;!*#@$_%]`
var PubidChar = /[\x20\x0D\x0Aa-zA-Z0-9-'()+,./:=?;!*#@$_%]/;

// https://www.w3.org/TR/xml11/#NT-PubidLiteral
// `[12] PubidLiteral ::= '"' PubidChar* '"' | "'" (PubidChar - "'")* "'"`
var PubidLiteral = regg('"', PubidChar, '*"', '|', "'", chars_without(PubidChar, "'"), "*'");

// https://www.w3.org/TR/xml11/#NT-CharData
// `[14] CharData    ::= [^<&]* - ([^<&]* ']]>' [^<&]*)`

var COMMENT_START = '<!--';
var COMMENT_END = '-->';
// https://www.w3.org/TR/xml11/#NT-Comment
// `[15] Comment ::= '<!--' ((Char - '-') | ('-' (Char - '-')))* '-->'`
var Comment = reg(COMMENT_START, regg(chars_without(Char, '-'), '|', reg('-', chars_without(Char, '-'))), '*', COMMENT_END);

var PCDATA = '#PCDATA';
// https://www.w3.org/TR/xml11/#NT-Mixed
// `[51] Mixed ::= '(' S? '#PCDATA' (S? '|' S? Name)* S? ')*' | '(' S? '#PCDATA' S? ')'`
// https://www.w3.org/TR/xml-names/#NT-Mixed
// `[51] Mixed ::= '(' S? '#PCDATA' (S? '|' S? QName)* S? ')*' | '(' S? '#PCDATA' S? ')'`
// [VC: Proper Group/PE Nesting] [VC: No Duplicate Types]
var Mixed = regg(
	reg(/\(/, S_OPT, PCDATA, regg(S_OPT, /\|/, S_OPT, QName), '*', S_OPT, /\)\*/),
	'|',
	reg(/\(/, S_OPT, PCDATA, S_OPT, /\)/)
);

var _children_quantity = /[?*+]?/;
/*
 `[49] choice ::= '(' S? cp ( S? '|' S? cp )+ S? ')'` [VC: Proper Group/PE Nesting]
 `[50] seq ::= '(' S? cp ( S? ',' S? cp )* S? ')'` [VC: Proper Group/PE Nesting]
 simplification to solve circular referencing, but doesn't check validity constraint "Proper Group/PE Nesting"
 var _choice_or_seq = reg('[', NameChar_s, SChar_s, chars(_children_quantity), '()|,]*');
 ```
 [48] cp ::= (Name | choice | seq) ('?' | '*' | '+')?
         === (Name | '(' S? cp ( S? '|' S? cp )+ S? ')' | '(' S? cp ( S? ',' S? cp )* S? ')') ('?' | '*' | '+')?
         !== (Name | [_choice_or_seq]*) ('?' | '*' | '+')?
 ```
 simplification to solve circular referencing, but doesn't check validity constraint "Proper Group/PE Nesting"
 var cp = reg(regg(Name, '|', _choice_or_seq), _children_quantity);
*/
/*
Inefficient regular expression (High)
This part of the regular expression may cause exponential backtracking on strings starting with '(|' and containing many repetitions of '|'.
https://github.com/xmldom/xmldom/security/code-scanning/91
var choice = regg(/\(/, S_OPT, cp, regg(S_OPT, /\|/, S_OPT, cp), '+', S_OPT, /\)/);
*/
/*
Inefficient regular expression (High)
This part of the regular expression may cause exponential backtracking on strings starting with '(,' and containing many repetitions of ','.
https://github.com/xmldom/xmldom/security/code-scanning/92
var seq = regg(/\(/, S_OPT, cp, regg(S_OPT, /,/, S_OPT, cp), '*', S_OPT, /\)/);
*/

// `[47] children ::= (choice | seq) ('?' | '*' | '+')?`
// simplification to solve circular referencing, but doesn't check validity constraint "Proper Group/PE Nesting"
var children = reg(/\([^>]+\)/, _children_quantity /*regg(choice, '|', seq), _children_quantity*/);

// https://www.w3.org/TR/xml11/#NT-contentspec
// `[46] contentspec ::= 'EMPTY' | 'ANY' | Mixed | children`
var contentspec = regg('EMPTY', '|', 'ANY', '|', Mixed, '|', children);

var ELEMENTDECL_START = '<!ELEMENT';
// https://www.w3.org/TR/xml11/#NT-elementdecl
// `[45] elementdecl ::= '<!ELEMENT' S Name S contentspec S? '>'`
// https://www.w3.org/TR/xml-names/#NT-elementdecl
// `[17] elementdecl ::= '<!ELEMENT' S QName S contentspec S? '>'`
// because of https://www.w3.org/TR/xml11/#NT-PEReference
// since xmldom is not supporting replacements of PEReferences in the DTD
// this also supports PEReference in the possible places
var elementdecl = reg(ELEMENTDECL_START, S, regg(QName, '|', PEReference), S, regg(contentspec, '|', PEReference), S_OPT, '>');

// https://www.w3.org/TR/xml11/#NT-NotationType
// `[58] NotationType ::= 'NOTATION' S '(' S? Name (S? '|' S? Name)* S? ')'`
// [VC: Notation Attributes] [VC: One Notation Per Element Type] [VC: No Notation on Empty Element] [VC: No Duplicate Tokens]
var NotationType = reg('NOTATION', S, /\(/, S_OPT, Name, regg(S_OPT, /\|/, S_OPT, Name), '*', S_OPT, /\)/);
// https://www.w3.org/TR/xml11/#NT-Enumeration
// `[59] Enumeration ::= '(' S? Nmtoken (S? '|' S? Nmtoken)* S? ')'`
// [VC: Enumeration] [VC: No Duplicate Tokens]
var Enumeration = reg(/\(/, S_OPT, Nmtoken, regg(S_OPT, /\|/, S_OPT, Nmtoken), '*', S_OPT, /\)/);

// https://www.w3.org/TR/xml11/#NT-EnumeratedType
// `[57] EnumeratedType ::= NotationType | Enumeration`
var EnumeratedType = regg(NotationType, '|', Enumeration);

/*
```
[55] StringType ::= 'CDATA'
[56] TokenizedType ::= 'ID' [VC: ID] [VC: One ID per Element Type] [VC: ID Attribute Default]
   | 'IDREF' [VC: IDREF]
   | 'IDREFS' [VC: IDREF]
	 | 'ENTITY' [VC: Entity Name]
	 | 'ENTITIES' [VC: Entity Name]
	 | 'NMTOKEN' [VC: Name Token]
	 | 'NMTOKENS' [VC: Name Token]
 [54] AttType ::= StringType | TokenizedType | EnumeratedType
```*/
var AttType = regg(/CDATA|ID|IDREF|IDREFS|ENTITY|ENTITIES|NMTOKEN|NMTOKENS/, '|', EnumeratedType);

// `[60] DefaultDecl ::= '#REQUIRED' | '#IMPLIED' | (('#FIXED' S)? AttValue)`
// [WFC: No < in Attribute Values] [WFC: No External Entity References]
// [VC: Fixed Attribute Default] [VC: Required Attribute] [VC: Attribute Default Value Syntactically Correct]
var DefaultDecl = regg(/#REQUIRED|#IMPLIED/, '|', regg(regg('#FIXED', S), '?', AttValue));

// https://www.w3.org/TR/xml11/#NT-AttDef
// [53] AttDef ::= S Name S AttType S DefaultDecl
// https://www.w3.org/TR/xml-names/#NT-AttDef
// [1] NSAttName ::= PrefixedAttName | DefaultAttName
// [2] PrefixedAttName ::= 'xmlns:' NCName [NSC: Reserved Prefixes and Namespace Names]
// [3] DefaultAttName ::= 'xmlns'
// [21] AttDef ::= S (QName | NSAttName) S AttType S DefaultDecl
// 						 === S Name S AttType S DefaultDecl
// xmldom is not distinguishing between QName and NSAttName on this level
// to support XML without namespaces in DTD we can not restrict it to QName
var AttDef = regg(S, Name, S, AttType, S, DefaultDecl);

var ATTLIST_DECL_START = '<!ATTLIST';
// https://www.w3.org/TR/xml11/#NT-AttlistDecl
// `[52] AttlistDecl ::= '<!ATTLIST' S Name AttDef* S? '>'`
// https://www.w3.org/TR/xml-names/#NT-AttlistDecl
// `[20] AttlistDecl ::= '<!ATTLIST' S QName AttDef* S? '>'`
// to support XML without namespaces in DTD we can not restrict it to QName
var AttlistDecl = reg(ATTLIST_DECL_START, S, Name, AttDef, '*', S_OPT, '>');

// https://html.spec.whatwg.org/multipage/urls-and-fetching.html#about:legacy-compat
var ABOUT_LEGACY_COMPAT = 'about:legacy-compat';
var ABOUT_LEGACY_COMPAT_SystemLiteral = regg('"' + ABOUT_LEGACY_COMPAT + '"', '|', "'" + ABOUT_LEGACY_COMPAT + "'");
var SYSTEM = 'SYSTEM';
var PUBLIC = 'PUBLIC';
// https://www.w3.org/TR/xml11/#NT-ExternalID
// `[75] ExternalID ::= 'SYSTEM' S SystemLiteral | 'PUBLIC' S PubidLiteral S SystemLiteral`
var ExternalID = regg(regg(SYSTEM, S, SystemLiteral), '|', regg(PUBLIC, S, PubidLiteral, S, SystemLiteral));
var ExternalID_match = reg(
	'^',
	regg(
		regg(SYSTEM, S, '(?<SystemLiteralOnly>', SystemLiteral, ')'),
		'|',
		regg(PUBLIC, S, '(?<PubidLiteral>', PubidLiteral, ')', S, '(?<SystemLiteral>', SystemLiteral, ')')
	)
);
// Full-string anchored matcher for requireWellFormed serializer checks
// https://w3c.github.io/DOM-Parsing/#xml-serializing-a-document-node
var PubidLiteral_match = reg('^', PubidLiteral, '$');
// Full-string anchored matcher for requireWellFormed serializer checks
// https://w3c.github.io/DOM-Parsing/#xml-serializing-a-document-node
var SystemLiteral_match = reg('^', SystemLiteral, '$');

// https://www.w3.org/TR/xml11/#NT-NDataDecl
// `[76] NDataDecl ::= S 'NDATA' S Name` [VC: Notation Declared]
var NDataDecl = regg(S, 'NDATA', S, Name);

// https://www.w3.org/TR/xml11/#NT-EntityDef
// `[73] EntityDef ::= EntityValue | (ExternalID NDataDecl?)`
var EntityDef = regg(EntityValue, '|', regg(ExternalID, NDataDecl, '?'));

var ENTITY_DECL_START = '<!ENTITY';
// https://www.w3.org/TR/xml11/#NT-GEDecl
// `[71] GEDecl ::= '<!ENTITY' S Name S EntityDef S? '>'`
var GEDecl = reg(ENTITY_DECL_START, S, Name, S, EntityDef, S_OPT, '>');
// https://www.w3.org/TR/xml11/#NT-PEDef
// `[74] PEDef ::= EntityValue | ExternalID`
var PEDef = regg(EntityValue, '|', ExternalID);
// https://www.w3.org/TR/xml11/#NT-PEDecl
// `[72] PEDecl ::= '<!ENTITY' S '%' S Name S PEDef S? '>'`
var PEDecl = reg(ENTITY_DECL_START, S, '%', S, Name, S, PEDef, S_OPT, '>');
// https://www.w3.org/TR/xml11/#NT-EntityDecl
// `[70] EntityDecl ::= GEDecl | PEDecl`
var EntityDecl = regg(GEDecl, '|', PEDecl);

// https://www.w3.org/TR/xml11/#NT-PublicID
// `[83] PublicID    ::= 'PUBLIC' S PubidLiteral`
var PublicID = reg(PUBLIC, S, PubidLiteral);
// https://www.w3.org/TR/xml11/#NT-NotationDecl
// `[82] NotationDecl    ::= '<!NOTATION' S Name S (ExternalID | PublicID) S? '>'` [VC: Unique Notation Name]
var NotationDecl = reg('<!NOTATION', S, Name, S, regg(ExternalID, '|', PublicID), S_OPT, '>');

// https://www.w3.org/TR/xml11/#NT-Eq
// `[25] Eq ::= S? '=' S?`
var Eq = reg(S_OPT, '=', S_OPT);
// https://www.w3.org/TR/xml/#NT-VersionNum
// `[26] VersionNum ::= '1.' [0-9]+`
// https://www.w3.org/TR/xml11/#NT-VersionNum
// `[26] VersionNum ::= '1.1'`
var VersionNum = /1[.]\d+/;
// https://www.w3.org/TR/xml11/#NT-VersionInfo
// `[24] VersionInfo ::= S 'version' Eq ("'" VersionNum "'" | '"' VersionNum '"')`
var VersionInfo = reg(S, 'version', Eq, regg("'", VersionNum, "'", '|', '"', VersionNum, '"'));
// https://www.w3.org/TR/xml11/#NT-EncName
// `[81] EncName ::= [A-Za-z] ([A-Za-z0-9._] | '-')*`
var EncName = /[A-Za-z][-A-Za-z0-9._]*/;
// https://www.w3.org/TR/xml11/#NT-EncDecl
// `[80] EncodingDecl ::= S 'encoding' Eq ('"' EncName '"' | "'" EncName "'" )`
var EncodingDecl = regg(S, 'encoding', Eq, regg('"', EncName, '"', '|', "'", EncName, "'"));
// https://www.w3.org/TR/xml11/#NT-SDDecl
// `[32] SDDecl ::= S 'standalone' Eq (("'" ('yes' | 'no') "'") | ('"' ('yes' | 'no') '"'))`
var SDDecl = regg(S, 'standalone', Eq, regg("'", regg('yes', '|', 'no'), "'", '|', '"', regg('yes', '|', 'no'), '"'));
// https://www.w3.org/TR/xml11/#NT-XMLDecl
// [23] XMLDecl ::= '<?xml' VersionInfo EncodingDecl? SDDecl? S? '?>'
var XMLDecl = reg(/^<\?xml/, VersionInfo, EncodingDecl, '?', SDDecl, '?', S_OPT, /\?>/);

/*
 https://www.w3.org/TR/xml/#NT-markupdecl
 https://www.w3.org/TR/xml11/#NT-markupdecl
 `[29] markupdecl ::= elementdecl | AttlistDecl | EntityDecl | NotationDecl | PI | Comment`
 var markupdecl = regg(elementdecl, '|', AttlistDecl, '|', EntityDecl, '|', NotationDecl, '|', PI_unsafe, '|', Comment);
*/
/*
 https://www.w3.org/TR/xml-names/#NT-doctypedecl
`[28a] DeclSep   ::= PEReference | S`
 https://www.w3.org/TR/xml11/#NT-intSubset
```
 [28b] intSubset ::= (markupdecl | DeclSep)*
                 === (markupdecl | PEReference | S)*
```
 [WFC: PE Between Declarations]
 var intSubset = reg(regg(markupdecl, '|', PEReference, '|', S), '*');
*/
var DOCTYPE_DECL_START = '<!DOCTYPE';
/*
 https://www.w3.org/TR/xml11/#NT-doctypedecl
 `[28] doctypedecl ::= '<!DOCTYPE' S Name (S ExternalID)? S? ('[' intSubset ']' S?)? '>'`
 https://www.afterwardsw3.org/TR/xml-names/#NT-doctypedecl
 `[16] doctypedecl ::= '<!DOCTYPE' S QName (S ExternalID)? S? ('[' (markupdecl | PEReference | S)* ']' S?)? '>'`
 var doctypedecl = reg('<!DOCTYPE', S, Name, regg(S, ExternalID), '?', S_OPT, regg(/\[/, intSubset, /]/, S_OPT), '?', '>');
*/

var CDATA_START = '<![CDATA[';
var CDATA_END = ']]>';
var CDStart = /<!\[CDATA\[/;
var CDEnd = /\]\]>/;
var CData = reg(Char, '*?', CDEnd);
/*
 https://www.w3.org/TR/xml/#dt-cdsection
 `[18]   	CDSect	   ::=   	CDStart CData CDEnd`
 `[19]   	CDStart	   ::=   	'<![CDATA['`
 `[20]   	CData	   ::=   	(Char* - (Char* ']]>' Char*))`
 `[21]   	CDEnd	   ::=   	']]>'`
*/
var CDSect = reg(CDStart, CData);

// unit tested
exports.chars = chars;
exports.chars_without = chars_without;
exports.detectUnicodeSupport = detectUnicodeSupport;
exports.reg = reg;
exports.regg = regg;
exports.ABOUT_LEGACY_COMPAT = ABOUT_LEGACY_COMPAT;
exports.ABOUT_LEGACY_COMPAT_SystemLiteral = ABOUT_LEGACY_COMPAT_SystemLiteral;
exports.AttlistDecl = AttlistDecl;
exports.CDATA_START = CDATA_START;
exports.CDATA_END = CDATA_END;
exports.CDSect = CDSect;
exports.Char = Char;
exports.Comment = Comment;
exports.COMMENT_START = COMMENT_START;
exports.COMMENT_END = COMMENT_END;
exports.DOCTYPE_DECL_START = DOCTYPE_DECL_START;
exports.elementdecl = elementdecl;
exports.EntityDecl = EntityDecl;
exports.EntityValue = EntityValue;
exports.ExternalID = ExternalID;
exports.ExternalID_match = ExternalID_match;
exports.Name = Name;
exports.Name_exact = Name_exact;
exports.NCName_exact = NCName_exact;
exports.NotationDecl = NotationDecl;
exports.Reference = Reference;
exports.PEReference = PEReference;
exports.PI = PI;
exports.PUBLIC = PUBLIC;
exports.PubidLiteral = PubidLiteral;
exports.PubidLiteral_match = PubidLiteral_match;
exports.QName = QName;
exports.QName_exact = QName_exact;
exports.QName_group = QName_group;
exports.S = S;
exports.SChar_s = SChar_s;
exports.S_OPT = S_OPT;
exports.SYSTEM = SYSTEM;
exports.SystemLiteral = SystemLiteral;
exports.SystemLiteral_match = SystemLiteral_match;
exports.InvalidChar = InvalidChar;
exports.UNICODE_REPLACEMENT_CHARACTER = UNICODE_REPLACEMENT_CHARACTER;
exports.UNICODE_SUPPORT = UNICODE_SUPPORT;
exports.XMLDecl = XMLDecl;

},{}],8:[function(require,module,exports){
'use strict';
var conventions = require('./conventions');
exports.assign = conventions.assign;
exports.hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
exports.isHTMLMimeType = conventions.isHTMLMimeType;
exports.isValidMimeType = conventions.isValidMimeType;
exports.MIME_TYPE = conventions.MIME_TYPE;
exports.NAMESPACE = conventions.NAMESPACE;

var errors = require('./errors');
exports.DOMException = errors.DOMException;
exports.DOMExceptionName = errors.DOMExceptionName;
exports.ExceptionCode = errors.ExceptionCode;
exports.ParseError = errors.ParseError;

var dom = require('./dom');
exports.Attr = dom.Attr;
exports.CDATASection = dom.CDATASection;
exports.CharacterData = dom.CharacterData;
exports.Comment = dom.Comment;
exports.Document = dom.Document;
exports.DocumentFragment = dom.DocumentFragment;
exports.DocumentType = dom.DocumentType;
exports.DOMImplementation = dom.DOMImplementation;
exports.Element = dom.Element;
exports.Entity = dom.Entity;
exports.EntityReference = dom.EntityReference;
exports.LiveNodeList = dom.LiveNodeList;
exports.NamedNodeMap = dom.NamedNodeMap;
exports.Node = dom.Node;
exports.NodeList = dom.NodeList;
exports.Notation = dom.Notation;
exports.ProcessingInstruction = dom.ProcessingInstruction;
exports.Text = dom.Text;
exports.XMLSerializer = dom.XMLSerializer;

var domParser = require('./dom-parser');
exports.DOMParser = domParser.DOMParser;
exports.normalizeLineEndings = domParser.normalizeLineEndings;
exports.onErrorStopParsing = domParser.onErrorStopParsing;
exports.onWarningStopParsing = domParser.onWarningStopParsing;

},{"./conventions":2,"./dom":4,"./dom-parser":3,"./errors":6}],9:[function(require,module,exports){
'use strict';

var conventions = require('./conventions');
var g = require('./grammar');
var errors = require('./errors');

var isHTMLEscapableRawTextElement = conventions.isHTMLEscapableRawTextElement;
var isHTMLMimeType = conventions.isHTMLMimeType;
var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
var hasOwn = conventions.hasOwn;
var NAMESPACE = conventions.NAMESPACE;
var ParseError = errors.ParseError;
var DOMException = errors.DOMException;

//var handlers = 'resolveEntity,getExternalSubset,characters,endDocument,endElement,endPrefixMapping,ignorableWhitespace,processingInstruction,setDocumentLocator,skippedEntity,startDocument,startElement,startPrefixMapping,notationDecl,unparsedEntityDecl,error,fatalError,warning,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,comment,endCDATA,endDTD,endEntity,startCDATA,startDTD,startEntity'.split(',')

//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
var S_TAG = 0; //tag name offerring
var S_ATTR = 1; //attr name offerring
var S_ATTR_SPACE = 2; //attr name end and space offer
var S_EQ = 3; //=space?
var S_ATTR_NOQUOT_VALUE = 4; //attr value(no quot value only)
var S_ATTR_END = 5; //attr value end and no space(quot end)
var S_TAG_SPACE = 6; //(attr value end || tag end ) && (space offer)
var S_TAG_CLOSE = 7; //closed el<el />

function XMLReader() {}

XMLReader.prototype = {
	parse: function (source, defaultNSMap, entityMap) {
		var domBuilder = this.domBuilder;
		domBuilder.startDocument();
		_copy(defaultNSMap, (defaultNSMap = Object.create(null)));
		parse(source, defaultNSMap, entityMap, domBuilder, this.errorHandler);
		domBuilder.endDocument();
	},
};

/**
 * Detecting everything that might be a reference,
 * including those without ending `;`, since those are allowed in HTML.
 * The entityReplacer takes care of verifying and transforming each occurrence,
 * and reports to the errorHandler on those that are not OK,
 * depending on the context.
 */
var ENTITY_REG = /&#?\w+;?/g;

function parse(source, defaultNSMapCopy, entityMap, domBuilder, errorHandler) {
	var isHTML = isHTMLMimeType(domBuilder.mimeType);
	if (source.indexOf(g.UNICODE_REPLACEMENT_CHARACTER) >= 0) {
		errorHandler.warning('Unicode replacement character detected, source encoding issues?');
	}

	function fixedFromCharCode(code) {
		// String.prototype.fromCharCode does not supports
		// > 2 bytes unicode chars directly
		if (code > 0xffff) {
			code -= 0x10000;
			var surrogate1 = 0xd800 + (code >> 10),
				surrogate2 = 0xdc00 + (code & 0x3ff);

			return String.fromCharCode(surrogate1, surrogate2);
		} else {
			return String.fromCharCode(code);
		}
	}

	function entityReplacer(a) {
		var complete = a[a.length - 1] === ';' ? a : a + ';';
		if (!isHTML && complete !== a) {
			errorHandler.error('EntityRef: expecting ;');
			return a;
		}
		var match = g.Reference.exec(complete);
		if (!match || match[0].length !== complete.length) {
			errorHandler.error('entity not matching Reference production: ' + a);
			return a;
		}
		var k = complete.slice(1, -1);
		if (hasOwn(entityMap, k)) {
			return entityMap[k];
		} else if (k.charAt(0) === '#') {
			return fixedFromCharCode(parseInt(k.substring(1).replace('x', '0x')));
		} else {
			errorHandler.error('entity not found:' + a);
			return a;
		}
	}

	function appendText(end) {
		//has some bugs
		if (end > start) {
			var xt = source.substring(start, end).replace(ENTITY_REG, entityReplacer);
			locator && position(start);
			domBuilder.characters(xt, 0, end - start);
			start = end;
		}
	}

	var lineStart = 0;
	var lineEnd = 0;
	var linePattern = /\r\n?|\n|$/g;
	var locator = domBuilder.locator;

	function position(p, m) {
		while (p >= lineEnd && (m = linePattern.exec(source))) {
			lineStart = lineEnd;
			lineEnd = m.index + m[0].length;
			locator.lineNumber++;
		}
		locator.columnNumber = p - lineStart + 1;
	}

	var parseStack = [{ currentNSMap: defaultNSMapCopy }];
	var unclosedTags = [];
	var start = 0;
	while (true) {
		try {
			var tagStart = source.indexOf('<', start);
			if (tagStart < 0) {
				if (!isHTML && unclosedTags.length > 0) {
					return errorHandler.fatalError('unclosed xml tag(s): ' + unclosedTags.join(', '));
				}
				if (!source.substring(start).match(/^\s*$/)) {
					var doc = domBuilder.doc;
					var text = doc.createTextNode(source.substring(start));
					if (doc.documentElement) {
						// `return errorHandler.error` is not a common pattern,
						// it is usually only used with `.fatalError`s.
						// In this case it is intentional, because it allows to stop parsing
						// and returning doc after reporting the extra content that will not be part of the document.
						return errorHandler.error('Extra content at the end of the document');
					}
					doc.appendChild(text);
					domBuilder.currentElement = text;
				}
				return;
			}
			if (tagStart > start) {
				var fromSource = source.substring(start, tagStart);
				if (!isHTML && unclosedTags.length === 0) {
					fromSource = fromSource.replace(new RegExp(g.S_OPT.source, 'g'), '');
					fromSource && errorHandler.error("Unexpected content outside root element: '" + fromSource + "'");
				}
				appendText(tagStart);
			}
			switch (source.charAt(tagStart + 1)) {
				case '/':
					var end = source.indexOf('>', tagStart + 2);
					var tagNameRaw = source.substring(tagStart + 2, end > 0 ? end : undefined);
					if (!tagNameRaw) {
						return errorHandler.fatalError('end tag name missing');
					}
					var endTagNameStrict = g.reg('^', g.QName_group, g.S_OPT, '$');
					var tagNameMatch = end > 0 && endTagNameStrict.exec(tagNameRaw);
					if (!tagNameMatch) {
						var leadingTagNameMatch = end > 0 && g.reg('^', g.QName_group).exec(tagNameRaw);
						if (isHTML && leadingTagNameMatch) {
							errorHandler.warning('end tag name contains invalid trailing characters: "' + tagNameRaw + '"');
							tagNameMatch = leadingTagNameMatch;
						} else if (
							// Backward compatibility, remove this whole `else if` arm in the next breaking release
							// (XML then falls through to the `fatalError` below, for a clean mode split: XML fatal,
							// HTML warning). A valid end-tag name followed by a line break and trailing content was
							// silently accepted while `reg` still used the `m` flag; re-adding `m` here matches exactly
							// those inputs, kept recoverable and reported.
							leadingTagNameMatch &&
							new RegExp(endTagNameStrict.source, endTagNameStrict.flags + 'm').test(tagNameRaw)
						) {
							errorHandler.error('end tag name is followed by a line break and trailing content: "' + tagNameRaw + '"');
							tagNameMatch = leadingTagNameMatch;
						} else {
							return errorHandler.fatalError('end tag name contains invalid characters: "' + tagNameRaw + '"');
						}
					}
					if (!domBuilder.currentElement && !domBuilder.doc.documentElement) {
						// not enough information to provide a helpful error message,
						// but parsing will throw since there is no root element
						return;
					}
					var currentTagName =
						unclosedTags[unclosedTags.length - 1] ||
						domBuilder.currentElement.tagName ||
						domBuilder.doc.documentElement.tagName ||
						'';
					if (currentTagName !== tagNameMatch[1]) {
						var tagNameLower = tagNameMatch[1].toLowerCase();
						if (!isHTML || currentTagName.toLowerCase() !== tagNameLower) {
							return errorHandler.fatalError('Opening and ending tag mismatch: "' + currentTagName + '" != "' + tagNameRaw + '"');
						}
					}
					var config = parseStack.pop();
					unclosedTags.pop();
					var localNSMap = config.localNSMap;
					domBuilder.endElement(config.uri, config.localName, currentTagName);
					if (localNSMap) {
						for (var prefix in localNSMap) {
							if (hasOwn(localNSMap, prefix)) {
								domBuilder.endPrefixMapping(prefix);
							}
						}
					}

					end++;
					break;
				// end element
				case '?': // <?...?>
					locator && position(tagStart);
					end = parseProcessingInstruction(source, tagStart, domBuilder, errorHandler);
					break;
				case '!': // <!doctype,<![CDATA,<!--
					locator && position(tagStart);
					end = parseDoctypeCommentOrCData(source, tagStart, domBuilder, errorHandler, isHTML);
					break;
				default:
					locator && position(tagStart);
					var el = new ElementAttributes();
					var currentNSMap = parseStack[parseStack.length - 1].currentNSMap;
					//elStartEnd
					var end = parseElementStartPart(source, tagStart, el, currentNSMap, entityReplacer, errorHandler, isHTML);
					var len = el.length;

					if (!el.closed) {
						if (isHTML && conventions.isHTMLVoidElement(el.tagName)) {
							el.closed = true;
						} else {
							unclosedTags.push(el.tagName);
						}
					}
					if (locator && len) {
						var locator2 = copyLocator(locator, {});
						//try{//attribute position fixed
						for (var i = 0; i < len; i++) {
							var a = el[i];
							position(a.offset);
							a.locator = copyLocator(locator, {});
						}
						domBuilder.locator = locator2;
						if (appendElement(el, domBuilder, currentNSMap)) {
							parseStack.push(el);
						}
						domBuilder.locator = locator;
					} else {
						if (appendElement(el, domBuilder, currentNSMap)) {
							parseStack.push(el);
						}
					}

					if (isHTML && !el.closed) {
						end = parseHtmlSpecialContent(source, end, el.tagName, entityReplacer, domBuilder);
					} else {
						end++;
					}
			}
		} catch (e) {
			if (e instanceof ParseError) {
				throw e;
			} else if (e instanceof DOMException) {
				// A DOMException raised while building the DOM is not-well-formed input,
				// so it is wrapped into a ParseError and reported before being thrown.
				return errorHandler.fatalError('Error constructing the DOM: ' + e.name + ': ' + e.message, e);
			}
			errorHandler.error('element parse error: ' + e);
			end = -1;
		}
		if (end > start) {
			start = end;
		} else {
			//Possible sax fallback here, risk of positional error
			appendText(Math.max(tagStart, start) + 1);
		}
	}
}

function copyLocator(f, t) {
	t.lineNumber = f.lineNumber;
	t.columnNumber = f.columnNumber;
	return t;
}

/**
 * @returns
 * end of the elementStartPart(end of elementEndPart for selfClosed el)
 * @see {@link #appendElement}
 */
function parseElementStartPart(source, start, el, currentNSMap, entityReplacer, errorHandler, isHTML) {
	/**
	 * @param {string} qname
	 * @param {string} value
	 * @param {number} startIndex
	 */
	function addAttribute(qname, value, startIndex) {
		if (hasOwn(el.attributeNames, qname)) {
			return errorHandler.fatalError('Attribute ' + qname + ' redefined');
		}
		if (!isHTML && value.indexOf('<') >= 0) {
			return errorHandler.fatalError("Unescaped '<' not allowed in attributes values");
		}
		el.addValue(
			qname,
			// @see https://www.w3.org/TR/xml/#AVNormalize
			// since the xmldom sax parser does not "interpret" DTD the following is not implemented:
			// - recursive replacement of (DTD) entity references
			// - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
			value.replace(/[\t\n\r]/g, ' ').replace(ENTITY_REG, entityReplacer),
			startIndex
		);
	}

	var attrName;
	var value;
	var p = ++start;
	var s = S_TAG; //status
	while (true) {
		var c = source.charAt(p);
		if (s === S_TAG && c === '<') {
			// A `<` can never occur inside a tag name. Without this guard the scan runs
			// on to the next `>` (or EOF) before `setTagName` rejects the whole slice, so
			// a document with many `<` inside a malformed tag makes each one-character
			// recovery step re-scan to the distant `>` — O(n^2). Stopping at the `<` keeps
			// each recovery step bounded. The candidate scanned so far is reported raw,
			// consistent with the sibling invalid-tag-name throw below.
			throw new Error('unexpected < in tag name: ' + source.slice(start, p));
		}
		switch (c) {
			case '=':
				if (s === S_ATTR) {
					//attrName
					attrName = source.slice(start, p);
					s = S_EQ;
				} else if (s === S_ATTR_SPACE) {
					s = S_EQ;
				} else {
					//fatalError: equal must after attrName or space after attrName
					throw new Error('attribute equal must after attrName');
				}
				break;
			case "'":
			case '"':
				if (
					s === S_EQ ||
					s === S_ATTR //|| s == S_ATTR_SPACE
				) {
					//equal
					if (s === S_ATTR) {
						errorHandler.warning('attribute value must after "="');
						attrName = source.slice(start, p);
					}
					start = p + 1;
					p = source.indexOf(c, start);
					if (p > 0) {
						value = source.slice(start, p);
						addAttribute(attrName, value, start - 1);
						s = S_ATTR_END;
					} else {
						//fatalError: no end quot match
						throw new Error("attribute value no end '" + c + "' match");
					}
				} else if (s == S_ATTR_NOQUOT_VALUE) {
					value = source.slice(start, p);
					addAttribute(attrName, value, start);
					errorHandler.warning('attribute "' + attrName + '" missed start quot(' + c + ')!!');
					start = p + 1;
					s = S_ATTR_END;
				} else {
					//fatalError: no equal before
					throw new Error('attribute value must after "="');
				}
				break;
			case '/':
				switch (s) {
					case S_TAG:
						el.setTagName(source.slice(start, p));
					case S_ATTR_END:
					case S_TAG_SPACE:
					case S_TAG_CLOSE:
						s = S_TAG_CLOSE;
						el.closed = true;
					case S_ATTR_NOQUOT_VALUE:
					case S_ATTR:
						break;
					case S_ATTR_SPACE:
						el.closed = true;
						break;
					//case S_EQ:
					default:
						throw new Error("attribute invalid close char('/')");
				}
				break;
			case '': //end document
				errorHandler.error('unexpected end of input');
				if (s == S_TAG) {
					el.setTagName(source.slice(start, p));
				}
				return p;
			case '>':
				switch (s) {
					case S_TAG:
						el.setTagName(source.slice(start, p));
					case S_ATTR_END:
					case S_TAG_SPACE:
					case S_TAG_CLOSE:
						break; //normal
					case S_ATTR_NOQUOT_VALUE: //Compatible state
					case S_ATTR:
						value = source.slice(start, p);
						if (value.slice(-1) === '/') {
							el.closed = true;
							value = value.slice(0, -1);
						}
					case S_ATTR_SPACE:
						if (s === S_ATTR_SPACE) {
							value = attrName;
						}
						if (s == S_ATTR_NOQUOT_VALUE) {
							errorHandler.warning('attribute "' + value + '" missed quot(")!');
							addAttribute(attrName, value, start);
						} else {
							if (!isHTML) {
								errorHandler.warning('attribute "' + value + '" missed value!! "' + value + '" instead!!');
							}
							addAttribute(value, value, start);
						}
						break;
					case S_EQ:
						if (!isHTML) {
							return errorHandler.fatalError('AttValue: \' or " expected');
						}
				}
				return p;
			/*xml space '\x20' | #x9 | #xD | #xA; */
			case '\u0080':
				c = ' ';
			default:
				if (c <= ' ') {
					//space
					switch (s) {
						case S_TAG:
							el.setTagName(source.slice(start, p)); //tagName
							s = S_TAG_SPACE;
							break;
						case S_ATTR:
							attrName = source.slice(start, p);
							s = S_ATTR_SPACE;
							break;
						case S_ATTR_NOQUOT_VALUE:
							var value = source.slice(start, p);
							errorHandler.warning('attribute "' + value + '" missed quot(")!!');
							addAttribute(attrName, value, start);
						case S_ATTR_END:
							s = S_TAG_SPACE;
							break;
						//case S_TAG_SPACE:
						//case S_EQ:
						//case S_ATTR_SPACE:
						//	void();break;
						//case S_TAG_CLOSE:
						//ignore warning
					}
				} else {
					//not space
					//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
					//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
					switch (s) {
						//case S_TAG:void();break;
						//case S_ATTR:void();break;
						//case S_ATTR_NOQUOT_VALUE:void();break;
						case S_ATTR_SPACE:
							if (!isHTML) {
								errorHandler.warning('attribute "' + attrName + '" missed value!! "' + attrName + '" instead2!!');
							}
							addAttribute(attrName, attrName, start);
							start = p;
							s = S_ATTR;
							break;
						case S_ATTR_END:
							errorHandler.warning('attribute space is required"' + attrName + '"!!');
						case S_TAG_SPACE:
							s = S_ATTR;
							start = p;
							break;
						case S_EQ:
							s = S_ATTR_NOQUOT_VALUE;
							start = p;
							break;
						case S_TAG_CLOSE:
							throw new Error("elements closed character '/' and '>' must be connected to");
					}
				}
		} //end outer switch
		p++;
	}
}

/**
 * @returns
 * `true` if a new namespace has been defined.
 */
function appendElement(el, domBuilder, currentNSMap) {
	var tagName = el.tagName;
	var localNSMap = null;
	var i = el.length;
	while (i--) {
		var a = el[i];
		var qName = a.qName;
		var value = a.value;
		var nsp = qName.indexOf(':');
		if (nsp > 0) {
			var prefix = (a.prefix = qName.slice(0, nsp));
			var localName = qName.slice(nsp + 1);
			var nsPrefix = prefix === 'xmlns' && localName;
		} else {
			localName = qName;
			prefix = null;
			nsPrefix = qName === 'xmlns' && '';
		}
		//can not set prefix,because prefix !== ''
		a.localName = localName;
		//prefix == null for no ns prefix attribute
		if (nsPrefix !== false) {
			//hack!!
			if (localNSMap == null) {
				localNSMap = Object.create(null);
				// Derive the child scope's namespace map by prototype-chain inheritance
				// instead of a flat copy: lookups inherit ancestor prefixes transparently,
				// so a document nesting N scopes retains O(N) map entries rather than
				// sum(1..N) = O(N^2). `localNSMap` stays a flat own-only record of the
				// prefixes declared at THIS element, so own-property enumeration
				// (endPrefixMapping below) still reports only local declarations.
				currentNSMap = Object.create(currentNSMap);
			}
			currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
			a.uri = NAMESPACE.XMLNS;
			domBuilder.startPrefixMapping(nsPrefix, value);
		}
	}
	var i = el.length;
	while (i--) {
		a = el[i];
		if (a.prefix) {
			//no prefix attribute has no namespace
			if (a.prefix === 'xml') {
				a.uri = NAMESPACE.XML;
			}
			if (a.prefix !== 'xmlns') {
				a.uri = currentNSMap[a.prefix];
			}
		}
	}
	var nsp = tagName.indexOf(':');
	if (nsp > 0) {
		prefix = el.prefix = tagName.slice(0, nsp);
		localName = el.localName = tagName.slice(nsp + 1);
	} else {
		prefix = null; //important!!
		localName = el.localName = tagName;
	}
	//no prefix element has default namespace
	var ns = (el.uri = currentNSMap[prefix || '']);
	domBuilder.startElement(ns, localName, tagName, el);
	//endPrefixMapping and startPrefixMapping have not any help for dom builder
	//localNSMap = null
	if (el.closed) {
		domBuilder.endElement(ns, localName, tagName);
		if (localNSMap) {
			for (prefix in localNSMap) {
				if (hasOwn(localNSMap, prefix)) {
					domBuilder.endPrefixMapping(prefix);
				}
			}
		}
	} else {
		el.currentNSMap = currentNSMap;
		el.localNSMap = localNSMap;
		//parseStack.push(el);
		return true;
	}
}

function parseHtmlSpecialContent(source, elStartEnd, tagName, entityReplacer, domBuilder) {
	// https://html.spec.whatwg.org/#raw-text-elements
	// https://html.spec.whatwg.org/#escapable-raw-text-elements
	// https://html.spec.whatwg.org/#cdata-rcdata-restrictions:raw-text-elements
	// TODO: https://html.spec.whatwg.org/#cdata-rcdata-restrictions
	var isEscapableRaw = isHTMLEscapableRawTextElement(tagName);
	if (isEscapableRaw || isHTMLRawTextElement(tagName)) {
		// The closing tag of a raw-text element matches case-insensitively
		// (WHATWG HTML §13.2.5.14 RAWTEXT end tag name state). A case-sensitive
		// search that missed the closing tag would return -1 and the `substring`
		// below would treat -1 as a backward slice from position 0, re-emitting all
		// prior source and amplifying output quadratically across repeated elements.
		// The regex is anchored to `elStartEnd` via `lastIndex` so it scans forward
		// only (O(distance), not the whole source).
		var closeTag = new RegExp('</' + tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '>', 'ig');
		closeTag.lastIndex = elStartEnd;
		var match = closeTag.exec(source);
		var elEndStart = match ? match.index : -1;
		if (elEndStart < 0) {
			// No closing tag: never slice with a -1 end index. Leave the element to
			// the parse loop's normal recovery instead of back-capturing the source.
			return elStartEnd + 1;
		}
		var text = source.substring(elStartEnd + 1, elEndStart);

		if (isEscapableRaw) {
			text = text.replace(ENTITY_REG, entityReplacer);
		}
		domBuilder.characters(text, 0, text.length);
		return elEndStart;
	}
	return elStartEnd + 1;
}

function _copy(source, target) {
	for (var n in source) {
		if (hasOwn(source, n)) {
			target[n] = source[n];
		}
	}
}

/**
 * @typedef ParseUtils
 * @property {function(relativeIndex: number?): string | undefined} char
 * Provides look ahead access to a singe character relative to the current index.
 * @property {function(): number} getIndex
 * Provides read-only access to the current index.
 * @property {function(reg: RegExp): string | null} getMatch
 * Applies the provided regular expression enforcing that it starts at the current index and
 * returns the complete matching string,
 * and moves the current index by the length of the matching string.
 * @property {function(): string} getSource
 * Provides read-only access to the complete source.
 * @property {function(places: number?): void} skip
 * moves the current index by places (defaults to 1)
 * @property {function(): number} skipBlanks
 * Moves the current index by the amount of white space that directly follows the current index
 * and returns the amount of whitespace chars skipped (0..n),
 * or -1 if the end of the source was reached.
 * @property {function(): string} substringFromIndex
 * creates a substring from the current index to the end of `source`
 * @property {function(compareWith: string): boolean} substringStartsWith
 * Checks if `source` contains `compareWith`, starting from the current index.
 * @property {function(compareWith: string): boolean} substringStartsWithCaseInsensitive
 * Checks if `source` contains `compareWith`, starting from the current index,
 * comparing the upper case of both sides.
 * @see {@link parseUtils}
 */

/**
 * A temporary scope for parsing and look ahead operations in `source`,
 * starting from index `start`.
 *
 * Some operations move the current index by a number of positions,
 * after which `getIndex` returns the new index.
 *
 * @param {string} source
 * @param {number} start
 * @returns {ParseUtils}
 */
function parseUtils(source, start) {
	var index = start;

	function char(n) {
		n = n || 0;
		return source.charAt(index + n);
	}

	function skip(n) {
		n = n || 1;
		index += n;
	}

	function skipBlanks() {
		var blanks = 0;
		while (index < source.length) {
			var c = char();
			if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') {
				return blanks;
			}
			blanks++;
			skip();
		}
		return -1;
	}
	function substringFromIndex() {
		return source.substring(index);
	}
	function substringStartsWith(text) {
		return source.substring(index, index + text.length) === text;
	}
	function substringStartsWithCaseInsensitive(text) {
		return source.substring(index, index + text.length).toUpperCase() === text.toUpperCase();
	}

	function getMatch(args) {
		var expr = g.reg('^', args);
		var match = expr.exec(substringFromIndex());
		if (match) {
			skip(match[0].length);
			return match[0];
		}
		return null;
	}
	return {
		char: char,
		getIndex: function () {
			return index;
		},
		getMatch: getMatch,
		getSource: function () {
			return source;
		},
		skip: skip,
		skipBlanks: skipBlanks,
		substringFromIndex: substringFromIndex,
		substringStartsWith: substringStartsWith,
		substringStartsWithCaseInsensitive: substringStartsWithCaseInsensitive,
	};
}

/**
 * @param {ParseUtils} p
 * @param {DOMHandler} errorHandler
 * @returns {string}
 */
function parseDoctypeInternalSubset(p, errorHandler) {
	/**
	 * @param {ParseUtils} p
	 * @param {DOMHandler} errorHandler
	 * @returns {string}
	 */
	function parsePI(p, errorHandler) {
		var match = g.PI.exec(p.substringFromIndex());
		if (!match) {
			return errorHandler.fatalError('processing instruction is not well-formed at position ' + p.getIndex());
		}
		if (match[1].toLowerCase() === 'xml') {
			return errorHandler.fatalError(
				'xml declaration is only allowed at the start of the document, but found at position ' + p.getIndex()
			);
		}
		p.skip(match[0].length);
		return match[0];
	}
	// Parse internal subset
	var source = p.getSource();
	if (p.char() === '[') {
		p.skip(1);
		var intSubsetStart = p.getIndex();
		while (p.getIndex() < source.length) {
			p.skipBlanks();
			if (p.char() === ']') {
				var internalSubset = source.substring(intSubsetStart, p.getIndex());
				p.skip(1);
				return internalSubset;
			}
			var current = null;
			// Only in external subset
			// if (char() === '<' && char(1) === '!' && char(2) === '[') {
			// 	parseConditionalSections(p, errorHandler);
			// } else
			if (p.char() === '<' && p.char(1) === '!') {
				switch (p.char(2)) {
					case 'E': // ELEMENT | ENTITY
						if (p.char(3) === 'L') {
							current = p.getMatch(g.elementdecl);
						} else if (p.char(3) === 'N') {
							current = p.getMatch(g.EntityDecl);
						}
						break;
					case 'A': // ATTRIBUTE
						current = p.getMatch(g.AttlistDecl);
						break;
					case 'N': // NOTATION
						current = p.getMatch(g.NotationDecl);
						break;
					case '-': // COMMENT
						current = p.getMatch(g.Comment);
						break;
				}
			} else if (p.char() === '<' && p.char(1) === '?') {
				current = parsePI(p, errorHandler);
			} else if (p.char() === '%') {
				current = p.getMatch(g.PEReference);
			} else {
				return errorHandler.fatalError('Error detected in Markup declaration');
			}
			if (!current) {
				return errorHandler.fatalError('Error in internal subset at position ' + p.getIndex());
			}
		}
		return errorHandler.fatalError('doctype internal subset is not well-formed, missing ]');
	}
}

/**
 * Called when the parser encounters an element starting with '<!'.
 *
 * @param {string} source
 * The xml.
 * @param {number} start
 * the start index of the '<!'
 * @param {DOMHandler} domBuilder
 * @param {DOMHandler} errorHandler
 * @param {boolean} isHTML
 * @returns {number | never}
 * The end index of the element.
 * @throws {ParseError}
 * In case the element is not well-formed.
 */
function parseDoctypeCommentOrCData(source, start, domBuilder, errorHandler, isHTML) {
	var p = parseUtils(source, start);

	switch (isHTML ? p.char(2).toUpperCase() : p.char(2)) {
		case '-':
			// should be a comment
			var comment = p.getMatch(g.Comment);
			if (comment) {
				domBuilder.comment(comment, g.COMMENT_START.length, comment.length - g.COMMENT_START.length - g.COMMENT_END.length);
				return p.getIndex();
			} else {
				return errorHandler.fatalError('comment is not well-formed at position ' + p.getIndex());
			}
		case '[':
			// should be CDATA
			var cdata = p.getMatch(g.CDSect);
			if (cdata) {
				if (!isHTML && !domBuilder.currentElement) {
					return errorHandler.fatalError('CDATA outside of element');
				}
				domBuilder.startCDATA();
				domBuilder.characters(cdata, g.CDATA_START.length, cdata.length - g.CDATA_START.length - g.CDATA_END.length);
				domBuilder.endCDATA();
				return p.getIndex();
			} else {
				return errorHandler.fatalError('Invalid CDATA starting at position ' + start);
			}
		case 'D': {
			// should be DOCTYPE
			if (domBuilder.doc && domBuilder.doc.documentElement) {
				return errorHandler.fatalError('Doctype not allowed inside or after documentElement at position ' + p.getIndex());
			}
			if (isHTML ? !p.substringStartsWithCaseInsensitive(g.DOCTYPE_DECL_START) : !p.substringStartsWith(g.DOCTYPE_DECL_START)) {
				return errorHandler.fatalError('Expected ' + g.DOCTYPE_DECL_START + ' at position ' + p.getIndex());
			}
			p.skip(g.DOCTYPE_DECL_START.length);
			if (p.skipBlanks() < 1) {
				return errorHandler.fatalError('Expected whitespace after ' + g.DOCTYPE_DECL_START + ' at position ' + p.getIndex());
			}

			var doctype = {
				name: undefined,
				publicId: undefined,
				systemId: undefined,
				internalSubset: undefined,
			};
			// Parse the DOCTYPE name
			doctype.name = p.getMatch(g.Name);
			if (!doctype.name)
				return errorHandler.fatalError('doctype name missing or contains unexpected characters at position ' + p.getIndex());

			if (isHTML && doctype.name.toLowerCase() !== 'html') {
				errorHandler.warning('Unexpected DOCTYPE in HTML document at position ' + p.getIndex());
			}
			p.skipBlanks();

			// Check for ExternalID
			if (p.substringStartsWith(g.PUBLIC) || p.substringStartsWith(g.SYSTEM)) {
				var match = g.ExternalID_match.exec(p.substringFromIndex());
				if (!match) {
					return errorHandler.fatalError('doctype external id is not well-formed at position ' + p.getIndex());
				}
				if (match.groups.SystemLiteralOnly !== undefined) {
					doctype.systemId = match.groups.SystemLiteralOnly;
				} else {
					doctype.systemId = match.groups.SystemLiteral;
					doctype.publicId = match.groups.PubidLiteral;
				}
				p.skip(match[0].length);
			} else if (isHTML && p.substringStartsWithCaseInsensitive(g.SYSTEM)) {
				// https://html.spec.whatwg.org/multipage/syntax.html#doctype-legacy-string
				p.skip(g.SYSTEM.length);
				if (p.skipBlanks() < 1) {
					return errorHandler.fatalError('Expected whitespace after ' + g.SYSTEM + ' at position ' + p.getIndex());
				}
				doctype.systemId = p.getMatch(g.ABOUT_LEGACY_COMPAT_SystemLiteral);
				if (!doctype.systemId) {
					return errorHandler.fatalError(
						'Expected ' + g.ABOUT_LEGACY_COMPAT + ' in single or double quotes after ' + g.SYSTEM + ' at position ' + p.getIndex()
					);
				}
			}
			if (isHTML && doctype.systemId && !g.ABOUT_LEGACY_COMPAT_SystemLiteral.test(doctype.systemId)) {
				errorHandler.warning('Unexpected doctype.systemId in HTML document at position ' + p.getIndex());
			}
			if (!isHTML) {
				p.skipBlanks();
				doctype.internalSubset = parseDoctypeInternalSubset(p, errorHandler);
			}
			p.skipBlanks();
			if (p.char() !== '>') {
				return errorHandler.fatalError('doctype not terminated with > at position ' + p.getIndex());
			}
			p.skip(1);
			domBuilder.startDTD(doctype.name, doctype.publicId, doctype.systemId, doctype.internalSubset);
			domBuilder.endDTD();
			return p.getIndex();
		}
		default:
			return errorHandler.fatalError('Not well-formed XML starting with "<!" at position ' + start);
	}
}

function parseProcessingInstruction(source, start, domBuilder, errorHandler) {
	var match = source.substring(start).match(g.PI);
	if (!match) {
		return errorHandler.fatalError('Invalid processing instruction starting at position ' + start);
	}
	if (match[1].toLowerCase() === 'xml') {
		if (start > 0) {
			return errorHandler.fatalError(
				'processing instruction at position ' + start + ' is an xml declaration which is only at the start of the document'
			);
		}
		if (!g.XMLDecl.test(source.substring(start))) {
			return errorHandler.fatalError('xml declaration is not well-formed');
		}
	}
	domBuilder.processingInstruction(match[1], match[2]);
	return start + match[0].length;
}

function ElementAttributes() {
	this.attributeNames = Object.create(null);
}

ElementAttributes.prototype = {
	setTagName: function (tagName) {
		if (!g.QName_exact.test(tagName)) {
			throw new Error('invalid tagName:' + tagName);
		}
		this.tagName = tagName;
	},
	addValue: function (qName, value, offset) {
		if (!g.QName_exact.test(qName)) {
			throw new Error('invalid attribute:' + qName);
		}
		this.attributeNames[qName] = this.length;
		this[this.length++] = { qName: qName, value: value, offset: offset };
	},
	length: 0,
	getLocalName: function (i) {
		return this[i].localName;
	},
	getLocator: function (i) {
		return this[i].locator;
	},
	getQName: function (i) {
		return this[i].qName;
	},
	getURI: function (i) {
		return this[i].uri;
	},
	getValue: function (i) {
		return this[i].value;
	},
	//	,getIndex:function(uri, localName)){
	//		if(localName){
	//
	//		}else{
	//			var qName = uri
	//		}
	//	},
	//	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
	//	getType:function(uri,localName){}
	//	getType:function(i){},
};

exports.XMLReader = XMLReader;
exports.parseUtils = parseUtils;
exports.parseDoctypeCommentOrCData = parseDoctypeCommentOrCData;

},{"./conventions":2,"./errors":6,"./grammar":7}],10:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],11:[function(require,module,exports){
(function (Buffer){(function (){
!function(e,t){"object"==typeof exports&&"object"==typeof module?module.exports=t():"function"==typeof define&&define.amd?define([],t):"object"==typeof exports?exports.ExifReader=t():e.ExifReader=t()}(Object("undefined"!=typeof self?self:this),function(){return e={d:function(t,n){for(var r in n)e.o(n,r)&&!e.o(t,r)&&Object.defineProperty(t,r,{enumerable:1,get:n[r]})},o:function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},r:function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:1})}},t={},function(){"use strict";function n(e){return n="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},n(e)}function r(e){var t=function(e){if("object"!=n(e)||!e)return e;var t=e[Symbol.toPrimitive];if(void 0!==t){var r=t.call(e,"string");if("object"!=n(r))return r;throw new TypeError("@@toPrimitive must return a primitive value.")}return e+""}(e);return"symbol"==n(t)?t:t+""}e.r(t),e.d(t,{default:function(){return $f},errors:function(){return Zf},load:function(){return Qf},loadView:function(){return ts}});var i=function(){return e=function e(t){if(function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),function(e){return"object"!==n(e)||void 0===e.length||void 0===e.readUInt8||void 0===e.readUInt16LE||void 0===e.readUInt16BE||void 0===e.readUInt32LE||void 0===e.readUInt32BE||void 0===e.readInt32LE||void 0===e.readInt32BE}(t))throw Error("DataView: Passed buffer type is unsupported.");this.buffer=t,this.byteLength=this.buffer.length},(t=[{key:"getUint8",value:function(e){return this.buffer.readUInt8(e)}},{key:"getUint16",value:function(e,t){return t?this.buffer.readUInt16LE(e):this.buffer.readUInt16BE(e)}},{key:"getUint32",value:function(e,t){return t?this.buffer.readUInt32LE(e):this.buffer.readUInt32BE(e)}},{key:"getInt32",value:function(e,t){return t?this.buffer.readInt32LE(e):this.buffer.readInt32BE(e)}}])&&function(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||0,i.configurable=1,"value"in i&&(i.writable=1),Object.defineProperty(e,r(i.key),i)}}(e.prototype,t),Object.defineProperty(e,"prototype",{writable:0}),e;var e,t}();function o(e,t,n){try{return new DataView(e,t,n)}catch(r){return new i(e,t,n)}}function a(e,t,n){for(var r=[],i=0;i<n&&t+i<e.byteLength;i++)r.push(e.getUint8(t+i));return c(r)}function u(e,t,n){for(var r=[],i=0;i+2<=n&&t+i+2<=e.byteLength;i+=2)r.push(e.getUint16(t+i));return 0===r[r.length-1]&&r.pop(),c(r)}function f(e,t){var n=e.getUint8(t);return[n,a(e,t+1,n)]}var s=8192;function c(e){if(!Array.isArray(e))throw new TypeError("Expected an array.");for(var t=[],n=[],r=0,i=0;i<e.length;i++)i in e&&(n[r++]=e[i],r===s&&(t.push(String.fromCharCode.apply(null,n)),r=0));return n.length=r,t.push(String.fromCharCode.apply(null,n)),t.join("")}function l(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:0,n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:e.length,r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:[];if(n-t<=s)return d(e,t,n,r);for(var i=[],o=t;o<n;o+=s)i.push(d(e,o,Math.min(o+s,n),r));return i.join("")}function d(e,t,n,r){for(var i=t;i<n;i++)r[i-t]=e[i];return r.length=n-t,String.fromCharCode.apply(null,r)}function p(e,t,n){if(!Array.isArray(e))throw new TypeError("Expected an array.");for(var r=[],i=[],o=0;o<e.length;o+=65536)i.push(g(e,o,Math.min(o+65536,e.length),t,n,r));return i.join(n)}function g(e,t,n,r,i,o){for(var a=t;a<n;a++)o[a-t]=r(e[a]);return o.length=n-t,o.join(i)}function h(e){var t=m(e);return void 0===t?e:t}function m(e){for(var t=1,n=0;n<e.length;){var r=v(e,n);if(0===r)return;r>1&&(t=0),n+=r}return t?e:decodeURIComponent(escape(e))}function v(e,t){var n,r=e.charCodeAt(t);if(r<128)return 1;var i=128,o=191;if(r>=194&&r<=223)n=2;else if(r>=224&&r<=239)n=3,224===r?i=160:237===r&&(o=159);else{if(!(r>=240&&r<=244))return 0;n=4,240===r?i=144:244===r&&(o=143)}if(t+n>e.length)return 0;var a=e.charCodeAt(t+1);if(!(a>=i&&a<=o))return 0;for(var u=2;u<n;u++){var f=e.charCodeAt(t+u);if(!(f>=128&&f<=191))return 0}return n}function y(e,t,n,r){if(e&&t)if(e.length<4096)e.push({type:t,start:n,end:r});else{var i=e[e.length-1];i.start=Math.min(i.start,n),i.end=Math.max(i.end,r)}}function b(){if("undefined"==typeof Promise)throw Error("Promise is required when async mode is enabled.")}function S(){for(var e=1;e<arguments.length;e++)for(var t in arguments[e])x(arguments[0],t,arguments[e][t]);return arguments[0]}function x(e,t,n){"__proto__"!==t?e[t]=n:Object.defineProperty(e,t,{value:n,enumerable:1,writable:1,configurable:1})}function I(e){return"__proto__"!==e&&Object.prototype.hasOwnProperty.call(Object.prototype,e)?e+"_":e}function A(e,t,n){var r=0;Object.defineProperty(e,t,{get:function(){return r||(r=1,Object.defineProperty(e,t,{configurable:1,enumerable:1,value:n.apply(e),writable:1})),e[t]},configurable:1,enumerable:1})}function P(e){return"string"==typeof e&&"undefined"!=typeof btoa?btoa(e):"undefined"!=typeof Buffer&&"undefined"!=typeof Buffer.from&&Buffer.from!==Uint8Array.from?Buffer.from(e).toString("base64"):"undefined"!=typeof btoa?btoa(l(new Uint8Array(e))):"undefined"!=typeof Buffer?new Buffer(e).toString("base64"):void 0}function T(e){var t=e.indexOf(","),n=e.substring(0,t),r=e.substring(t+1);if(-1!==n.indexOf(";base64")){var i=function(e){return-1===e.indexOf("%")||/[\u0080-\uffff]/.test(e)?e:l(E(e))}(r);if("undefined"!=typeof atob)return function(e){for(var t=new Uint8Array(e.length),n=0;n<e.length;n++)t[n]=e.charCodeAt(n);return t.buffer}(atob(i));if("undefined"==typeof Buffer)return;return"undefined"!=typeof Buffer.from?Buffer.from(i,"base64"):new Buffer(i,"base64")}return E(r).buffer}function E(e){for(var t=/[\u0080-\uffff]/.test(e)?unescape(encodeURIComponent(e)):e,n=new Uint8Array(t.length-2*function(e){for(var t=0,n=0;n<e.length;n++)C(e,n)&&(t++,n+=2);return t}(t)),r=0,i=0;i<t.length;i++)C(t,i)?(n[r++]=16*U(t.charCodeAt(i+1))+U(t.charCodeAt(i+2)),i+=2):n[r++]=t.charCodeAt(i);return n}function C(e,t){return 37===e.charCodeAt(t)&&t+2<e.length&&-1!==U(e.charCodeAt(t+1))&&-1!==U(e.charCodeAt(t+2))}function U(e){return e>=48&&e<=57?e-48:e>=65&&e<=70?e-65+10:e>=97&&e<=102?e-97+10:-1}function O(e,t,n){return w(n,Math.max(0,t-e.length))+e}function w(e,t){return Array(t+1).join(e)}var M=void 0,L=0,F="brotli",R=134217728;function D(e,t,n){var r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:"string",i=arguments.length>4?arguments[4]:void 0,o=N(i),a=function(e,t){return e&&e.budget?e.budget:{remaining:t,warned:0}}(i,o);if(t!==M&&a.remaining<0)return B(a,o);var u=function(e){return e===L?"deflate":e===F?"brotli":void 0}(t);if(i&&u){var f=i[u];if("function"==typeof f)return new Promise(function(t){return t(f(G(e)))}).then(function(e){return a.remaining-=function(e){return e&&"number"==typeof e.byteLength?e.byteLength:0}(e),a.remaining<0?B(a,o):"dataview"===r?e instanceof ArrayBuffer?new DataView(e):0===e.byteOffset&&e.byteLength===e.buffer.byteLength?new DataView(e.buffer):new DataView(e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)):new TextDecoder(n).decode(e)})}if(t===L&&"function"==typeof DecompressionStream)return k(e,"deflate",a,o).then(function(e){return _(e,r,n)});if(t===F){if("function"==typeof DecompressionStream)try{return k(e,"brotli",a,o).then(function(e){return _(e,r,n)})}catch(e){}return Promise.reject("Brotli decompression is not supported in this environment. Pass in a brotli decompression function via the decompress option.")}if(void 0!==t)return Promise.reject("Unknown compression method ".concat(t,"."));if("string"===r)try{return new TextDecoder(n).decode(e)}catch(t){return e?l(G(e)):""}return e}function N(e){return e&&"number"==typeof e.maxDecompressedSize?e.maxDecompressedSize:R}function G(e){return new Uint8Array(e.buffer,e.byteOffset,e.byteLength)}function k(e,t,n,r){var i=new DecompressionStream(t),o=new Blob([e]).stream().pipeThrough(i).getReader(),a=[],u=0;return function e(){return o.read().then(function(t){var i=t.done,f=t.value;return i?function(e,t){for(var n=new Uint8Array(t),r=0,i=0;i<e.length;i++)n.set(e[i],r),r+=e[i].byteLength;return n.buffer}(a,u):(u+=f.byteLength,n.remaining-=f.byteLength,n.remaining<0?o.cancel().then(function(){return B(n,r)}):(a.push(f),e()))})}()}function _(e,t,n){return"dataview"===t?new DataView(e):new TextDecoder(n).decode(e)}function B(e,t){return e.warned||"undefined"==typeof console||"function"!=typeof console.warn||(e.warned=1,console.warn("ExifReader: the total decompressed metadata size for this call would exceed the maximum of ".concat(t," bytes, so this and any later compressed metadata blocks are skipped."))),Promise.reject("Decompressed metadata exceeded the maximum allowed total size of ".concat(t," bytes."))}var j={builtin:function(e){return z(e,[V,X,H])},optionalPackage:function(e){return z(e,[V])}};function z(e,t){for(var n=0;n<t.length;n++)try{return t[n](e)}catch(e){}}function V(e){switch(e){case"fs":try{return require("fs")}catch(e){throw e}case"http":return require("http");case"https":return require("https");case"@xmldom/xmldom":try{return require("@xmldom/xmldom")}catch(e){throw e}default:throw Error("No webpack require for ".concat(e,"."))}}function X(e){return globalThis.process.getBuiltinModule(e)}function H(e){return globalThis.process.mainModule.require(e)}var W=200,K=299,J=416;function q(e){return"string"==typeof e}function Y(e){return"undefined"!=typeof File&&e instanceof File}function $(e){return/^data:[^;,]*(;base64)?,/.test(e)}function Z(e,t){var n=ee(t);return n?/^\w+:\/\//.test(e)?"undefined"!=typeof fetch?ne(e,n).then(function(e){return e.buffer}):fe(e,n).then(function(e){return e.buffer}):$(e)?Promise.resolve().then(function(){return T(e)}):le(e,n).then(function(e){return e.buffer}):te()}function Q(e,t){var n=ee(t);return n?pe(e,n).then(function(e){return e.buffer}):te()}function ee(e){var t=e?e.length:void 0;if(null==t)return{start:0};if(Number.isFinite(t)&&t>=0){var n=Math.floor(t);return{start:0,end:n,maxBytes:n}}}function te(){return Promise.reject(Error('The length option must be a finite non-negative number or "auto".'))}function ne(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=t.start,r=void 0===n?0:n,i=t.end,o=t.maxBytes;if(ae(r,i))return Promise.resolve({buffer:new ArrayBuffer(0),totalSize:void 0,status:void 0});var a={method:"GET"};return(r>0||void 0!==i&&i!==1/0)&&(a.headers={range:ue(r,i)}),fetch(e,a).then(function(e){var t=e&&"number"==typeof e.status?e.status:void 0;if(void 0!==t&&!function(e){return e>=W&&e<=K?1:e===J}(t)){ie(e.body);var n=e.statusText||"";return Promise.reject(Error("Could not fetch file: ".concat(t," ").concat(n).trim()))}var r=function(e){if(e&&e.headers&&"function"==typeof e.headers.get)return ce(e.headers.get("Content-Range"),e.headers.get("Content-Length"))}(e);return t===J?(ie(e.body),{buffer:new ArrayBuffer(0),totalSize:r,status:t}):function(e,t){return re(t)?e.body&&"function"==typeof e.body.getReader?function(e,t){return new Promise(function(n,r){var i=oe(t);function o(){if(i.isFull())return n(i.toArrayBuffer()),void ie(e);e.read().then(a).then(void 0,u)}function a(e){e.done?n(i.toArrayBuffer()):(i.add(e.value),o())}function u(t){r(t),ie(e)}o()})}(e.body.getReader(),t):Promise.resolve(e.arrayBuffer()).then(function(e){return e.slice(0,t)}):Promise.resolve(e.arrayBuffer())}(e,o).then(function(e){return{buffer:e,totalSize:r,status:t}})})}function re(e){return Number.isInteger(e)&&e>=0}function ie(e){Promise.resolve().then(function(){return e.cancel()}).then(void 0,function(){})}function oe(e){var t=new Uint8Array(0),n=0;return{add:function(r){var i,o=Math.min(r.byteLength,e-n);n+o>t.length&&((i=new Uint8Array(Math.min(e,Math.max(n+o,2*t.length)))).set(t.subarray(0,n)),t=i),t.set(r.subarray(0,o),n),n+=o},isFull:function(){return n>=e},toArrayBuffer:function(){if(t.length===n)return t.buffer;var e=new Uint8Array(n);return e.set(t.subarray(0,n)),e.buffer}}}function ae(e,t){return void 0!==t&&t!==1/0&&t<=e}function ue(e,t){return void 0===t||t===1/0?"bytes=".concat(e,"-"):"bytes=".concat(e,"-").concat(t-1)}function fe(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=t.start,r=void 0===n?0:n,i=t.end,o=t.maxBytes;return ae(r,i)?Promise.resolve({buffer:Buffer.alloc(0),totalSize:void 0,status:void 0}):new Promise(function(t,n){var a={};(r>0||void 0!==i&&i!==1/0)&&(a.headers={range:ue(r,i)});var u=function(e){var t=j.builtin(/^https:\/\//.test(e)?"https":"http");return t&&t.get}(e);if(!u)return n(Error("Node http support is not available."));u(e,a,function(e){if(e.statusCode>=W&&e.statusCode<=K){var r=se(e);if(re(o))!function(e,t,n,r){var i=oe(t),o=0;function a(){o=1,n(Buffer.from(i.toArrayBuffer()))}e.on("error",r),i.isFull()?(a(),e.destroy()):(e.on("data",function(t){o||(i.add(t),i.isFull()&&(a(),e.destroy()))}),e.on("end",a))}(e,o,function(n){return t({buffer:n,totalSize:r,status:e.statusCode})},n);else{var i=[];e.on("data",function(e){return i.push(Buffer.from(e))}),e.on("error",function(e){return n(e)}),e.on("end",function(){return t({buffer:Buffer.concat(i),totalSize:r,status:e.statusCode})})}}else if(e.statusCode===J){var a=se(e);e.destroy(),t({buffer:Buffer.alloc(0),totalSize:a,status:e.statusCode})}else n(Error("Could not fetch file: ".concat(e.statusCode," ").concat(e.statusMessage))),e.destroy()}).on("error",function(e){return n(e)})})}function se(e){if(e&&e.headers)return ce(e.headers["content-range"],e.headers["content-length"])}function ce(e,t){if(e){var n=/\/(\d+|\*)$/.exec(e);if(n&&"*"!==n[1])return parseInt(n[1],10)}if(t){var r=parseInt(t,10);if(Number.isFinite(r))return r}}function le(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=t.start,r=void 0===n?0:n,i=t.end,o=t.totalSize;return new Promise(function(t,n){var a=j.builtin("fs");if(!a)return n(Error("Node file system support is not available."));a.open(e,function(u,f){if(u)return n(u);!function(e,t,n,r){if(void 0!==n)return r(null,n);e.stat(t,function(e,t){return r(e,e?void 0:t.size)})}(a,e,o,function(o,u){if(o)return a.close(f,function(){return n(o)});var s=void 0===i||i===1/0||i>u?u:i,c=Math.min(Math.max(0,r),s),l=s-c,d=Buffer.alloc(l);if(0===l)return a.close(f,function(n){return de(e,n,d,u,t)});a.read(f,{buffer:d,length:l,position:c},function(r){if(r)return a.close(f,function(){return n(r)});a.close(f,function(n){return de(e,n,d,u,t)})})})})})}function de(e,t,n,r,i){t&&console.warn("Could not close file ".concat(e,":"),t),i({buffer:n,totalSize:r})}function pe(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=t.start,r=void 0===n?0:n,i=t.end;return new Promise(function(t,n){var o=new FileReader,a="number"==typeof e.size?e.size:void 0;if(o.onload=function(e){return t({buffer:e.target.result,totalSize:a})},o.onerror=function(){return n(o.error)},e&&"function"==typeof e.slice&&(r>0||void 0!==i&&i!==1/0)){var u=void 0===i||i===1/0?a:i;o.readAsArrayBuffer(e.slice(r,u))}else o.readAsArrayBuffer(e)})}function ge(e){return e instanceof ArrayBuffer?new Uint8Array(e):"undefined"!=typeof Buffer&&Buffer.isBuffer(e)||ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):new Uint8Array(e)}var he=131072,me=4,ve='length: "auto" could not locate metadata in this file (no metadata blocks found after reading the file — e.g. plain TIFF, bare JPEG XL codestream, or a file with no recognizable metadata).',ye='length: "auto" is not supported for this file type (no leading metadata container — e.g. plain TIFF or bare JPEG XL codestream).';function be(e){return function(e,r){b();var i=S({},r,{async:1});return q(e)?function(e,r){return/^\w+:\/\//.test(e)?"undefined"!=typeof fetch?n({readRange:function(t,n){return ne(e,{start:t,end:n,maxBytes:n})},options:r}):n({readRange:function(t,n){return fe(e,{start:t,end:n,maxBytes:n})},options:r}):$(e)?Promise.resolve().then(function(){return T(e)}).then(function(e){return t(e,r)}):n({readRange:function(t,n,r){return le(e,{start:t,end:n,totalSize:r?r.totalSize:void 0})},options:r})}(e,i):Y(e)?function(e,t){return n({readRange:function(t,n){return pe(e,{start:t,end:n})},options:t})}(e,i):t(e,i)};function t(t,n){return Promise.resolve().then(function(){return e(t,n)}).then(function(e){if(!e||!e.metadataRange)throw Error(ye);var n=e.metadataRange.end;return e.metadataRange.buffer=function(e,t){if("undefined"!=typeof Buffer&&Buffer.isBuffer(e))return Buffer.from(e.subarray(0,t));if(e instanceof ArrayBuffer)return e.slice(0,t);if("undefined"!=typeof SharedArrayBuffer&&e instanceof SharedArrayBuffer)return e.slice(0,t);if(ArrayBuffer.isView(e)){var n=Math.max(0,Math.min(t,e.byteLength));return e.buffer.slice(e.byteOffset,e.byteOffset+n)}return e}(t,n),e.metadataRange.fetched=Ie(e.metadataRange.buffer),e.metadataRange.requests=0,e})}function n(e){return r({readRange:e.readRange,options:e.options,buffer:null,fetched:0,requests:0,totalSize:void 0,need:he,iter:0})}function r(t){return t.iter>=me?i(t):(void 0!==t.totalSize&&(t.need=Math.min(t.need,t.totalSize)),t.need<=t.fetched?i(t):t.readRange(t.fetched,t.need,{totalSize:t.totalSize}).then(function(n){return t.requests++,n.status===J?function(t){return t.readRange(0,1/0,{totalSize:void 0}).then(function(n){return t.requests++,t.buffer=n.buffer,t.fetched=Ie(t.buffer),void 0!==n.totalSize&&(t.totalSize=n.totalSize),Promise.resolve(e(t.buffer,t.options))}).then(function(e){if(!e||!e.metadataRange)throw Error(ve);return xe(e,t.buffer,t.fetched,t.requests)})}(t):(Se(t,n),Promise.resolve(e(t.buffer,t.options)).then(function(e){return function(e,t){var n=t&&t.metadataRange;if(n&&n.complete)return xe(t,e.buffer,e.fetched,e.requests);var i=void 0!==e.totalSize&&e.fetched>=e.totalSize;if(!n&&i)throw Error(ve);var o=function(e){var t=e.range,n=e.totalSize,r=e.fetched;return t?Math.min(Math.max(t.end,2*r),void 0!==n?n:1/0):void 0!==n?n:2*r}({range:n,totalSize:e.totalSize,fetched:e.fetched});if(o<=e.fetched){if(n)return xe(t,e.buffer,e.fetched,e.requests);throw Error(ve)}return e.need=o,e.iter++,r(e)}(t,e)}))}))}function i(t){return console.warn('ExifReader: length:"auto" did not converge in '.concat(me," iterations; falling back to full read.")),(void 0!==t.totalSize&&t.fetched<t.totalSize?t.readRange(t.fetched,t.totalSize,{totalSize:t.totalSize}).then(function(e){t.requests++,Se(t,e)}):void 0===t.totalSize?t.readRange(t.fetched,1/0,{totalSize:t.totalSize}).then(function(e){t.requests++,Se(t,e)}):Promise.resolve()).then(function(){return Promise.resolve(e(t.buffer,t.options))}).then(function(e){if(!e||!e.metadataRange)throw Error(ve);return xe(e,t.buffer,t.fetched,t.requests)})}}function Se(e,t){if(t.status===W&&e.fetched>0)return e.buffer=t.buffer,e.fetched=Ie(e.buffer),void(void 0!==t.totalSize&&(e.totalSize=t.totalSize));void 0!==t.totalSize&&void 0===e.totalSize&&(e.totalSize=t.totalSize),e.buffer=function(e,t){if(!e)return t;if(!t)return e;if("undefined"!=typeof Buffer&&Buffer.isBuffer(e)&&Buffer.isBuffer(t))return Buffer.concat([e,t]);var n=ge(e),r=ge(t),i=new Uint8Array(n.byteLength+r.byteLength);return i.set(n,0),i.set(r,n.byteLength),i.buffer}(e.buffer,t.buffer),e.fetched=Ie(e.buffer)}function xe(e,t,n,r){var i=e.metadataRange.end;return e.metadataRange.buffer=function(e,t){return!e||"number"!=typeof t||t<0?e:"undefined"!=typeof Buffer&&Buffer.isBuffer(e)?Buffer.from(e.subarray(0,Math.min(t,e.length))):e instanceof ArrayBuffer||"undefined"!=typeof SharedArrayBuffer&&e instanceof SharedArrayBuffer?e.slice(0,Math.min(t,e.byteLength)):e}(t,i),e.metadataRange.fetched=n,e.metadataRange.requests=r,e}function Ie(e){return e?"number"==typeof e.byteLength?e.byteLength:"number"==typeof e.length?e.length:0:0}var Ae={USE_FILE:1,USE_JFIF:1,USE_PNG_FILE:1,USE_EXIF:1,USE_IPTC:1,USE_XMP:1,USE_ICC:1,USE_MPF:1,USE_PHOTOSHOP:1,USE_THUMBNAIL:1,USE_TIFF:1,USE_JPEG:1,USE_PNG:1,USE_HEIC:1,USE_AVIF:1,USE_JXL:1,USE_WEBP:1,USE_GIF:1,USE_MAKER_NOTES:1};function Pe(e){if(e.length>=8){var t=c(e.slice(0,8));if("ASCII\0\0\0"===t)return l(e,8);if("JIS\0\0\0\0\0"===t)return"[JIS encoded text]";if("UNICODE\0"===t)return"[Unicode encoded text]";if("\0\0\0\0\0\0\0\0"===t){var n=l(e,8);return/[\x20-\x7e]/.test(n)?n:"[Undefined encoding]"}}return"Undefined"}function Te(e){return Array.isArray(e)?e.some(Ee)?e.filter(Ee).join(", "):l(e):e}function Ee(e){return"string"==typeof e}function Ce(e,t){var n=t+"";return Object.prototype.hasOwnProperty.call(e,n)?e[n]:"Unknown"}function Ue(e){return e[0][0]/e[0][1]+e[1][0]/e[1][1]/60+e[2][0]/e[2][1]/3600}var Oe=18761,we=19789,Me={BIG_ENDIAN:we,LITTLE_ENDIAN:Oe,getByteOrder:function(e,t){if(e.getUint16(t)===Oe)return Oe;if(e.getUint16(t)===we)return we;throw Error("Illegal byte order value. Faulty image.")}};function Le(e,t,n){return t+n<=e.byteLength}function Fe(e,t,n,r,i,o,a,u,f){if(void 0===f)return[];for(var s=[],c=r.items,l=i.item.extent.extentIndex+i.item.extent.extentOffset+i.item.extent.extentLength,d=i.item.itemId+i.item.constructionMethod+i.item.dataReferenceIndex+i.item.baseOffset+i.item.extentCount,p=0,g=0;g<f&&!(c+d>t);g++){var h={extents:[]};h.itemId=De(e,c,n),c+=i.item.itemId,h.constructionMethod=1===n||2===n?15&e.getUint16(c):void 0,c+=i.item.constructionMethod,h.dataReferenceIndex=e.getUint16(c),c+=i.item.dataReferenceIndex,h.baseOffset=Ge(e,c,i.item.baseOffset),c+=i.item.baseOffset,h.extentCount=e.getUint16(c),c+=i.item.extentCount;for(var m=Re(h.extentCount,l,c,t,1048576-p),v=0;v<m;v++){var y={};y.extentIndex=Ne(e,n,c,u),c+=i.item.extent.extentIndex,y.extentOffset=Ge(e,c,o),c+=i.item.extent.extentOffset,y.extentLength=Ge(e,c,a),c+=i.item.extent.extentLength,h.extents.push(y)}if(p+=m,s.push(h),(h.extentCount-m)*l>0)break}return s}function Re(e,t,n,r,i){return 0===t?0:Math.max(0,Math.min(e,Math.floor((r-n)/t),i))}function De(e,t,n){return n<2?e.getUint16(t):2===n?e.getUint32(t):void 0}function Ne(e,t,n,r){if((1===t||2===t)&&r>0)return Ge(e,n,r)}function Ge(e,t,n){return 4===n?e.getUint32(t):8===n?function(e,t){return e.getUint32(t+4)}(e,t):0}function ke(e,t,n,r){return 8===e||8===t||8===n||8===r}var _e=1165519206,Be=1835625829,je={type:void 0};function ze(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:e.byteLength;if(Le(e,t,8))try{var r=Xe(e,t),i=r.length,o=r.contentOffset;if(i<o-t||o>n)return;var u=e.getUint32(t+4);if(1718909296===u)return function(e,t,n){return{type:"ftyp",majorBrand:a(e,t,4),length:n}}(e,o,i);if(1768977008===u)return function(e,t,n,r,i){return{type:"iprp",subBoxes:at(e,n,r-(n-t),i),length:r}}(e,t,o,i,n);if(1768973167===u)return function(e,t,n,r,i){return{type:"ipco",properties:nt(e,n,r-(n-t),i),length:r}}(e,t,o,i,n);if(1668246642===u)return function(e,t,n){return{type:"colr",icc:rt(e,t),length:n}}(e,o,i);if(1768186228===u)return function(e,t){return{type:"idat",contentOffset:e,length:t}}(o,i);if(!Le(e,o,1))return;var f=e.getUint8(o);return 1835365473===u?function(e,t,n,r,i){return{type:"meta",subBoxes:at(e,n+3,r-(n+3-t),i),length:r}}(e,t,o+1,i,n):1768714083===u?function(e,t,n,r,i,o){var a=function(e,t){var n={item:{dataReferenceIndex:2,extentCount:2,extent:{}}};e<2?(n.itemCount=2,n.item.itemId=2):2===e&&(n.itemCount=4,n.item.itemId=4),n.item.constructionMethod=1===e||2===e?2:0;var r={offsetSize:t,lengthSize:t,baseOffsetSize:t+1,indexSize:t+1};return r.itemCount=t+2,r.items=r.itemCount+n.itemCount,r.item={itemId:0},r.item.constructionMethod=r.item.itemId+n.item.itemId,r.item.dataReferenceIndex=r.item.constructionMethod+n.item.constructionMethod,{offsets:r,sizes:n}}(n,r+3),u=a.offsets,f=a.sizes,s=e.getUint8(u.offsetSize)>>4;f.item.extent.extentOffset=s;var c=15&e.getUint8(u.lengthSize);f.item.extent.extentLength=c;var l=e.getUint8(u.baseOffsetSize)>>4;f.item.baseOffset=l;var d=function(e,t,n){if(1===n||2===n)return 15&e.getUint8(t)}(e,u.indexSize,n);f.item.extent.extentIndex=void 0!==d?d:0;var p=function(e,t,n){return n<2?e.getUint16(t):2===n?e.getUint32(t):void 0}(e,u.itemCount,n);return{type:"iloc",items:Fe(e,Math.min(t+i,o),n,u,f,s,c,d,p),uses64BitFields:ke(s,c,l,d),length:i}}(e,t,f,o+1,i,n):1768517222===u?function(e,t,n,r,i,o){var a=r+3+(0===n?2:4);return{type:"iinf",itemInfos:at(e,a,i-(a-t),o),length:i}}(e,t,f,o+1,i,n):1768842853===u?function(e,t,n,r,i,o){r+=3;var a={type:"infe",length:i},u=Math.min(t+i,o);if(0!==n&&1!==n||(a.itemId=e.getUint16(r),r+=2,a.itemProtectionIndex=e.getUint16(r),r+=2,a.itemName=ft(e,r,u).value,r+=a.itemName.length+1),n>=2){2===n?(a.itemId=e.getUint16(r),r+=2):3===n&&(a.itemId=e.getUint32(r),r+=4),a.itemProtectionIndex=e.getUint16(r),r+=2,a.itemType=e.getUint32(r);var f=ft(e,r+=4,u);if(a.itemName=f.value,!f.isTerminated)return a;if(r+=a.itemName.length+1,a.itemType===Be){var s=ft(e,r,u);if(a.contentType=s.value,!s.isTerminated)return a;u>(r+=a.contentType.length+1)&&(a.contentEncoding=ft(e,r,u).value)}else 1970432288===a.itemType&&(a.itemUri=ft(e,r,u).value)}return a}(e,t,f,o+1,i,n):1885959277===u?function(e,t,n,r,i,o){var a=r+4;return a+(0===n?2:4)>it(e,t,i,o)?ot(i):{type:"pitm",itemId:0===n?e.getUint16(a):e.getUint32(a),length:i}}(e,t,f,o,i,n):1768975713===u?function(e,t,n,r,i,o){var a=r+4,u=it(e,t,i,o);return a+4>u?ot(i):{type:"ipma",version:n,flags:16777215&e.getUint32(r),entryCountOffset:a,end:u,length:i}}(e,t,f,o,i,n):1769173093===u?function(e,t,n,r,i){var o=n+4;return o+8>it(e,t,r,i)?ot(r):{type:"ispe",dimensionsOffset:o,length:r}}(e,t,o,i,n):1885960297===u?function(e,t,n,r,i,o){var a=r+4,u=it(e,t,i,o);return 0!==n||a+1>u||a+1+e.getUint8(a)>u?ot(i):{type:"pixi",channelCountOffset:a,length:i}}(e,t,f,o,i,n):ot(i)}catch(e){return}}function Ve(e,t){if(!e)return 0;try{var n=ze(e,0);return void 0!==n&&-1!==t.indexOf(n.majorBrand)}catch(e){return 0}}function Xe(e,t){var n=e.getUint32(t);if(function(e){return 0===e}(n))return{length:e.byteLength-t,contentOffset:t+4+4};if(function(e){return 1===e}(n)){if(!Le(e,t,16))return{length:0,contentOffset:t+4+4};if(function(e,t){return 0===e.getUint32(t+8)}(e,t))return{length:e.getUint32(t+12),contentOffset:t+4+4+8}}return{length:n,contentOffset:t+4+4}}function He(e,t){var n=function(e){for(var t=0;t+4+4<=e.byteLength;){var n=ze(e,t);if(void 0===n)break;if("meta"===n.type)return n;t+=n.length}}(e),r=function(e,t,n){if(Ae.USE_EXIF||Ae.USE_XMP||Ae.USE_ICC){var r={};if(!t)return{hasAppMarkers:0};if(function(e){var t=e.subBoxes.find(function(e){return"iloc"===e.type});t&&t.uses64BitFields&&console.warn("This file uses 8-byte iloc offset, length or index fields which are currently not fully supported by ExifReader. Contact the maintainer to get it fixed.")}(t),Ae.USE_EXIF){var i=function(e,t,n){try{var r=function(e){return e.subBoxes.find(function(e){return"iinf"===e.type}).itemInfos.find(function(e){return e.itemType===_e})}(t).itemId,i=$e(t,r);qe(i);var o=Je(t);if(We(n,i,"exif",o),i.extents.length>1){var a=Ye(e,i,o);if(void 0===a)return;return{tiffHeaderOffset:Ze(a,0),dataView:a}}var u=Ke(i,i.extents[0],o);if(void 0===u)return;return{tiffHeaderOffset:Ze(e,u)}}catch(e){return}}(e,t,n);void 0!==i&&(r.tiffHeaderOffset=i.tiffHeaderOffset,void 0!==i.dataView&&(r.exifDataView=i.dataView))}if(Ae.USE_XMP){var o=function(e,t,n){try{var r=function(e){return e.subBoxes.find(function(e){return"iinf"===e.type}).itemInfos.find(function(e){return e.itemType===Be&&"application/rdf+xml"===e.contentType})}(t).itemId,i=$e(t,r);qe(i);var o=Je(t);if(We(n,i,"xmp",o),i.extents.length>1){var a=Ye(e,i,o);if(void 0===a)return;return{chunks:[{dataOffset:0,length:a.byteLength}],dataView:a}}var u=i.extents[0],f=Ke(i,u,o);if(void 0===f)return;return{chunks:[{dataOffset:f,length:u.extentLength}]}}catch(e){return}}(e,t,n);void 0!==o&&(r.xmpChunks=o.chunks,void 0!==o.dataView&&(r.xmpDataView=o.dataView))}return Ae.USE_ICC&&(r.iccChunks=function(e,t){try{var n=e.subBoxes.find(function(e){return"iprp"===e.type}).subBoxes.find(function(e){return"ipco"===e.type}).properties.find(function(e){return"colr"===e.type}).icc;if(n)return y(t,"icc",n.offset,n.offset+n.length),[n]}catch(e){}}(t,n)),r.hasAppMarkers=void 0!==r.tiffHeaderOffset||void 0!==r.xmpChunks||void 0!==r.iccChunks,r}return{}}(e,n,t),i=function(e,t){try{if(!t)return{};var n=t.subBoxes.find(function(e){return"pitm"===e.type}),r=t.subBoxes.find(function(e){return"iprp"===e.type});if(!n||!r)return{};var i=r.subBoxes.find(function(e){return"ipco"===e.type});if(!i)return{};var o=function(e,t,n){for(var r=0;r<t.length;r++)if("ipma"===t[r].type){var i=Qe(e,t[r],n);if(i)return i}}(e,r.subBoxes,n.itemId);if(!o)return{};var a=tt(o,i.properties,"ispe"),u=tt(o,i.properties,"pixi");return{imageDimensionsOffset:a&&a.dimensionsOffset,pixelInformationOffset:u&&u.channelCountOffset}}catch(e){return{}}}(e,n),o=i.imageDimensionsOffset,a=i.pixelInformationOffset;return void 0!==o&&(r.imageDimensionsOffset=o),void 0!==a&&(r.pixelInformationOffset=a),r}function We(e,t,n,r){if(e)for(var i=0;i<t.extents.length;i++){var o=t.extents[i],a=Ke(t,o,r);void 0!==a&&y(e,n,a,a+o.extentLength)}}function Ke(e,t,n){var r=e.constructionMethod;return void 0===r||0===r?e.baseOffset+t.extentOffset:1===r&&void 0!==n?n+e.baseOffset+t.extentOffset:void 0}function Je(e){var t=e.subBoxes.find(function(e){return"idat"===e.type});return t?t.contentOffset:void 0}function qe(e){2===e.constructionMethod&&console.warn("This file uses iloc constructionMethod 2 (item_offset) which is currently not supported by ExifReader. Contact the maintainer to get it fixed.")}function Ye(e,t,n){for(var r=[],i=0,o=0;o<t.extents.length;o++){var a=t.extents[o],u=Ke(t,a,n);if(void 0===u||u+a.extentLength>e.byteLength)return;if(r.push({start:u,length:a.extentLength}),(i+=a.extentLength)>e.byteLength)return}for(var f=new Uint8Array(i),s=0,c=0;c<r.length;c++){for(var l=r[c],d=l.start,p=l.length,g=0;g<p;g++)f[s+g]=e.getUint8(d+g);s+=p}return new DataView(f.buffer)}function $e(e,t){return e.subBoxes.find(function(e){return"iloc"===e.type}).items.find(function(e){return e.itemId===t})}function Ze(e,t){return t+4+e.getUint32(t)}function Qe(e,t,n){for(var r=0===t.version?2:4,i=1&~t.flags?1:2,o=e.getUint32(t.entryCountOffset),a=t.entryCountOffset+4,u=0;u<o&&a+r+1<=t.end;u++){var f=2===r?e.getUint16(a):e.getUint32(a),s=e.getUint8(a+r);if(a+=r+1,f===n)return et(e,a,Math.min(s,Math.floor((t.end-a)/i)),i);a+=s*i}}function et(e,t,n,r){for(var i=2===r?32767:127,o=[],a=0;a<n;a++){var u=t+a*r,f=2===r?e.getUint16(u):e.getUint8(u);o.push(f&i)}return o}function tt(e,t,n){for(var r=0;r<e.length;r++){var i=t[e[r]-1];if(void 0!==i&&i.type===n)return i}}function nt(e,t,n,r){var i=[];return ut(e,t,n,r,function(e){i.push(void 0!==e.type?e:je)}),i}function rt(e,t){var n=a(e,t,4);if("prof"===n||"rICC"===n)return{offset:t+4,length:e.getUint32(t+4),chunkNumber:1,chunksTotal:1}}function it(e,t,n,r){return Math.min(t+n,r,e.byteLength)}function ot(e){return{type:void 0,length:e}}function at(e,t,n,r){var i=[_e,Be],o=[];return ut(e,t,n,r,function(e){void 0===e.type||void 0!==e.itemType&&-1===i.indexOf(e.itemType)||o.push(e)}),o}function ut(e,t,n,r,i){for(var o=Math.min(t+n,r),a=t;a+8<=o;){var u=ze(e,a,o);if(void 0===u)break;i(u),a+=u.length}}function ft(e,t,n){var r=Math.min(n,t+65536),i=function(e,t){for(var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:e.byteLength,r=Math.min(n,e.byteLength),i=[],o=0;t+o<r;){var a=e.getUint8(t+o);if(0===a)break;i.push(a),o++}return c(i)}(e,t,r);return{value:i,isTerminated:t+i.length<r}}var st=12,ct=2,lt=65496,dt=2,pt=4,gt=2,ht=2,mt=10,vt=18,yt=33,bt=79,St=18,xt=8,It="ICC_PROFILE\0",At=pt+It.length,Pt=At+1,Tt=255,Et=1024,Ct="MPF\0",Ut=65472,Ot=65474,wt=65476,Mt=65499,Lt=65501,Ft=65498,Rt=65504,Dt=65505,Nt=65506,Gt=65517,kt=65519,_t=65534,Bt=65535,jt="JFIF",zt="Exif",Vt="http://ns.adobe.com/xap/1.0/\0",Xt="http://ns.adobe.com/xmp/extension/\0",Ht="Photoshop 3.0",Wt="8BIM";function Kt(e,t){return e.getUint16(t)===Ut}function Jt(e,t){return e.getUint16(t)===Ot}function qt(e,t){var n=It.length;return e.getUint16(t)===Nt&&t+Pt<e.byteLength&&a(e,t+pt,n)===It}function Yt(e,t){var n=Ct.length;return e.getUint16(t)===Nt&&a(e,t+pt,n)===Ct}function $t(e,t){var n=jt.length;return e.getUint16(t)===Rt&&a(e,t+pt,n)===jt&&0===e.getUint8(t+pt+n)}function Zt(e,t){var n=zt.length;return e.getUint16(t)===Dt&&a(e,t+pt,n)===zt&&0===e.getUint8(t+pt+n)}function Qt(e,t){return e.getUint16(t)===Dt&&function(e,t){var n=Vt.length;return a(e,t+pt,n)===Vt}(e,t)}function en(e,t){return e.getUint16(t)===Dt&&function(e,t){var n=Xt.length;return a(e,t+pt,n)===Xt}(e,t)}function tn(e,t){return{dataOffset:e+yt,length:t-(yt-gt)}}function nn(e,t){return{dataOffset:e+bt,length:t-(bt-gt)}}function rn(e,t){var n=Ht.length,r=Wt.length,i=t+pt+n+1;return i+r<=e.byteLength&&e.getUint16(t)===Gt&&a(e,t+pt,n)===Ht&&0===e.getUint8(t+pt+n)&&a(e,i,r)===Wt}function on(e,t){var n=e.getUint16(t);return n>=Rt&&n<=kt||n===_t||n===Ut||n===Ot||n===wt||n===Mt||n===Lt||n===Ft}function an(e,t){return e.getUint16(t)===Bt}function un(e,t,n,r){var i=function(e,t,n){try{if(t+8>n)return;var r=e.getUint16(t+0),i=r===Me.LITTLE_ENDIAN;if(!i&&r!==Me.BIG_ENDIAN)return;if(42!==e.getUint16(t+2,i))return;var o=t+e.getUint32(t+4,i);if(o+2>n)return;var a=e.getUint16(o,i);return{ifdEntries:a,isValid:o+(2+a*st+4)<=n&&a>0}}catch(e){return}}(e,r,t+gt+n);if(!i)return 0;var o=Number.isInteger(i.ifdEntries)?i.ifdEntries:0;return(i.isValid?1e9:0)+1e6*o+n}var fn="PNG\r\n\n",sn=4,cn=4,ln=0,dn=sn,pn=sn+cn,gn="XML:com.adobe.xmp\0",hn="tEXt",mn="iTXt",vn="zTXt",yn="pHYs",bn="tIME",Sn="eXIf",xn="iCCP",In=79;function An(e,t){return"IHDR"===a(e,t+dn,cn)}function Pn(e,t){return a(e,t+dn,cn)===mn&&a(e,t+pn,gn.length)===gn}function Tn(e,t,n){var r=a(e,t+dn,cn);return r===hn||r===mn||r===vn&&n}function En(e,t){return a(e,t+dn,cn)===Sn}function Cn(e,t){return a(e,t+dn,cn)===xn}function Un(e,t){var n=[yn,bn],r=a(e,t+dn,cn);return n.includes(r)}function On(e,t){t+=pn+gn.length+1+1;for(var n=0;n<2&&t<e.byteLength;)0===e.getUint8(t)&&n++,t++;if(!(n<2))return t}function wn(e,t,n){var r=Math.min(t+n,e.byteLength),i=function(e,t,n){for(var r=0;r<=In&&t+r<n;r++)if(0===e.getUint8(t+r))return r}(e,t,r);if(void 0!==i){var o=t+i+1;if(!(o+1>r))return{profileName:a(e,t,i),compressionMethod:e.getUint8(o),compressedProfileOffset:o+1}}}var Mn=["heic","heix","hevc","hevx","heim","heis","hevm","hevs","mif1"],Ln=["avif"],Fn=[0,0,0,12,74,88,76,32,13,10,135,10],Rn=[255,10],Dn=1165519206,Nn=2020437024,Gn=1651666786,kn=1786276963,_n=1786276976,Bn=4,jn=4,zn=4;function Vn(e){return!e||e.byteLength<Rn.length?0:e.getUint8(0)===Rn[0]&&e.getUint8(1)===Rn[1]}var Xn=6,Hn=["GIF87a","GIF89a"],Wn=13,Kn=0,Jn="<?xpacket begin",qn=["<?xpacket end=","</x:xmpmeta>"];function Yn(e,t){for(var n=0;n+t.length<=e.byteLength;n++)if($n(e,n,t))return 1;return 0}function $n(e,t,n){for(var r=0;r<n.length;r++)if(e.getUint8(t+r)!==n.charCodeAt(r))return 0;return 1}var Zn={parseAppMarkers:function(e,t,n){var r=n?[]:void 0;if(Ae.USE_TIFF&&function(e){return!!e&&e.byteLength>=4&&function(e){var t=e.getUint16(0)===Me.LITTLE_ENDIAN;return 42===e.getUint16(2,t)}(e)}(e))return Qn(Ae.USE_EXIF?{hasAppMarkers:1,tiffHeaderOffset:0}:{},"tiff","TIFF",r);if(Ae.USE_JPEG&&function(e){return!!e&&e.byteLength>=ct&&e.getUint16(0)===lt}(e))return Qn(function(e,t){for(var n,r,i,o,a,u,f,s,c,l,d=dt,p=0,g=0;d+pt+5<=e.byteLength;){var h=void 0;if(e.getUint16(d)===Ft&&(g=1),Ae.USE_FILE&&Kt(e,d))n=e.getUint16(d+gt),r=d+gt,h="file";else if(Ae.USE_FILE&&Jt(e,d))n=e.getUint16(d+gt),i=d+gt,h="file";else if(Ae.USE_JFIF&&$t(e,d))n=e.getUint16(d+gt),o=d+ht,h="jfif";else if(Ae.USE_EXIF&&Zt(e,d)){n=e.getUint16(d+gt),p++;var m=d+mt;if(1===p)l={appMarkerPosition:d,fieldLength:n,tiffHeaderOffset:m,score:void 0};else{void 0===l.score&&(l.score=un(e,l.appMarkerPosition,l.fieldLength,l.tiffHeaderOffset));var v=un(e,d,n,m);v>l.score&&(l={appMarkerPosition:d,fieldLength:n,tiffHeaderOffset:m,score:v})}a=l.tiffHeaderOffset,h="exif"}else if(Ae.USE_XMP&&Qt(e,d))f||(f=[]),n=e.getUint16(d+gt),f.length<Et&&f.push(tn(d,n)),h="xmp";else if(Ae.USE_XMP&&en(e,d))f||(f=[]),n=e.getUint16(d+gt),f.length<Et&&f.push(nn(d,n)),h="xmp";else if(Ae.USE_IPTC&&rn(e,d))n=e.getUint16(d+gt),u=d+vt,h="iptc";else if(Ae.USE_ICC&&qt(e,d)){if(n=e.getUint16(d+gt),s||(s=[]),s.length<Tt){var b=d+St,S=n-(St-gt),x=e.getUint8(d+At),I=e.getUint8(d+Pt);s.push({offset:b,length:S,chunkNumber:x,chunksTotal:I})}h="icc"}else if(Ae.USE_MPF&&Yt(e,d))n=e.getUint16(d+gt),c=d+xt,h="mpf";else{if(!on(e,d)){if(an(e,d)){d++;continue}break}n=e.getUint16(d+gt)}y(t,h,d,d+gt+n),d+=gt+n}return p>1&&function(e){"undefined"!=typeof console&&"function"==typeof console.warn&&console.warn("ExifReader: Found ".concat(e," Exif segments (APP1). ")+"Will pick the best candidate segment.")}(p),t&&(!g&&d+gt<=e.byteLength&&e.getUint16(d)===Ft&&(g=1),t.truncated=!g),{hasAppMarkers:d>dt,fileDataOffset:r||i,jfifDataOffset:o,tiffHeaderOffset:a,iptcDataOffset:u,xmpChunks:f,iccChunks:s,mpfDataOffset:c}}(e,r),"jpeg","JPEG",r);if(Ae.USE_PNG&&function(e){return!!e&&a(e,0,fn.length)===fn}(e))return Qn(function(e,t,n){for(var r={hasAppMarkers:0},i=fn.length,o=0;i+sn+cn<=e.byteLength;){var u=void 0,f=e.getUint32(i+ln);if(n&&"IEND"===a(e,i+dn,cn)&&(o=1),Ae.USE_PNG_FILE&&An(e,i))r.hasAppMarkers=1,r.pngHeaderOffset=i+pn,u="file";else if(Ae.USE_XMP&&Pn(e,i)){var s=On(e,i);void 0!==s&&(r.hasAppMarkers=1,r.xmpChunks=[{dataOffset:s,length:f-(s-(i+pn))}],u="xmp")}else if(Tn(e,i,t))r.hasAppMarkers=1,r.pngTextChunks||(r.pngTextChunks=[]),r.pngTextChunks.push(i+ln),u="png";else if(En(e,i))r.hasAppMarkers=1,r.tiffHeaderOffset=i+pn,u="exif";else if(Ae.USE_ICC&&t&&Cn(e,i)){var c=i+pn,l=wn(e,c,f);void 0!==l&&(r.hasAppMarkers=1,r.iccChunks||(r.iccChunks=[{offset:l.compressedProfileOffset,length:f-(l.compressedProfileOffset-c),chunkNumber:1,chunksTotal:1,profileName:l.profileName,compressionMethod:l.compressionMethod}]),u="icc")}else Un(e,i)&&(r.hasAppMarkers=1,r.pngChunkOffsets||(r.pngChunkOffsets=[]),r.pngChunkOffsets.push(i+ln),u="png");var d=f+sn+cn+4;y(n,u,i,i+d),i+=d}return n&&(n.truncated=!o),r}(e,t,r),"png","PNG",r);if(Ae.USE_HEIC&&function(e){return Ve(e,Mn)}(e))return Qn(function(e,t){return He(e,t)}(e,r),"heic","HEIC",r);if(Ae.USE_AVIF&&function(e){return Ve(e,Ln)}(e))return Qn(function(e,t){return He(e,t)}(e,r),"avif","AVIF",r);if(Ae.USE_JXL&&function(e){try{return function(e){if(!e||e.byteLength<Fn.length)return 0;for(var t=0;t<Fn.length;t++)if(e.getUint8(t)!==Fn[t])return 0;return 1}(e)||Vn(e)}catch(e){return 0}}(e))return Qn(function(e,t){var n,r,i,o,a,u=0;if(Vn(e))return{hasAppMarkers:1,tiffHeaderOffset:void 0,xmpChunks:void 0,brobExifChunk:void 0,brobXmpChunk:void 0,jxlCodestreamOffset:0};for(;u+8<=e.byteLength;){var f=Xe(e,u),s=f.length,c=f.contentOffset;if(s<c-u)break;var l=Math.min(u+s,e.byteLength),d=e.getUint32(u+4),p=void 0;if(Ae.USE_EXIF&&d===Dn&&(c+zn<=l&&(n=Ze(e,c)),p="exif"),Ae.USE_XMP&&d===Nn&&(r=[{dataOffset:c,length:s-(c-u)}],p="xmp"),d===kn&&void 0===a&&(a=c),d===_n&&void 0===a&&c+Bn<=l&&!(2147483647&e.getUint32(c))&&(a=c+Bn),d===Gn&&c+jn<=l){var g=e.getUint32(c),h=c+jn,m=s-(h-u);Ae.USE_EXIF&&g===Dn&&(p="exif",void 0!==n||i||(i={dataOffset:h,length:m})),Ae.USE_XMP&&g===Nn&&(p="xmp",r||o||(o={dataOffset:h,length:m}))}y(t,p,u,u+s),u+=s}return{hasAppMarkers:void 0!==n||void 0!==r||void 0!==i||void 0!==o||void 0!==a,tiffHeaderOffset:n,xmpChunks:r,brobExifChunk:i,brobXmpChunk:o,jxlCodestreamOffset:a}}(e,r),"jxl","JPEG XL",r);if(Ae.USE_WEBP&&function(e){return!!e&&"RIFF"===a(e,0,4)&&"WEBP"===a(e,8,4)}(e))return Qn(function(e,t){for(var n,r,i,o,u=12,f=0;u+8<e.byteLength;){var s=a(e,u,4),c=e.getUint32(u+4,1),l=void 0;Ae.USE_EXIF&&"EXIF"===s?(f=1,n="Exif\0\0"===a(e,u+8,6)?u+8+6:u+8,l="exif"):Ae.USE_XMP&&"XMP "===s?(f=1,r=[{dataOffset:u+8,length:c}],l="xmp"):Ae.USE_ICC&&"ICCP"===s?(f=1,i=[{offset:u+8,length:c,chunkNumber:1,chunksTotal:1}],l="icc"):"VP8X"===s&&(f=1,o=u+8,l="riff");var d=8+(c%2==0?c:c+1);y(t,l,u,u+d),u+=d}return{hasAppMarkers:f,tiffHeaderOffset:n,xmpChunks:r,iccChunks:i,vp8xChunkOffset:o}}(e,r),"webp","WebP",r);if(Ae.USE_GIF&&function(e){return!!e&&Hn.includes(a(e,0,Xn))}(e))return Qn(function(e,t){return y(t,"gif",0,Wn),{gifHeaderOffset:0}}(0,r),"gif","GIF",r);if(Ae.USE_XMP&&function(e){return!!e&&a(e,Kn,Jn.length)===Jn}(e))return Qn(function(e,t){var n=[];return n.push({dataOffset:Kn,length:e.byteLength}),y(t,"xmp",0,e.byteLength),t&&(t.truncated=!function(e){for(var t=0;t<qn.length;t++)if(Yn(e,qn[t]))return 1;return 0}(e)),{xmpChunks:n}}(e,r),"xml","XML",r);throw Error("Invalid image format")}};function Qn(e,t,n,r){var i=S({},e,{fileType:{value:t,description:n}});return void 0!==r&&(i.metadataBlocks=r,i.metadataTruncated=!!r.truncated),i}var er={ApertureValue:function(e){return Math.pow(Math.sqrt(2),e[0]/e[1]).toFixed(2)},ColorSpace:function(e){return 1===e?"sRGB":65535===e?"Uncalibrated":"Unknown"},ComponentsConfiguration:function(e){return p(e,tr,"")},Contrast:function(e){return 0===e?"Normal":1===e?"Soft":2===e?"Hard":"Unknown"},CustomRendered:function(e){return 0===e?"Normal process":1===e?"Custom process":"Unknown"},ExposureMode:function(e){return 0===e?"Auto exposure":1===e?"Manual exposure":2===e?"Auto bracket":"Unknown"},ExposureProgram:function(e){return 0===e?"Undefined":1===e?"Manual":2===e?"Normal program":3===e?"Aperture priority":4===e?"Shutter priority":5===e?"Creative program":6===e?"Action program":7===e?"Portrait mode":8===e?"Landscape mode":9===e?"Bulb":"Unknown"},ExposureTime:function(e){if(e[0]/e[1]>.25){var t=e[0]/e[1];return Number.isInteger(t)?""+t:t.toFixed(1)}return 0!==e[0]?"1/".concat(Math.round(e[1]/e[0])):"0/".concat(e[1])},FNumber:function(e){return"f/".concat(Number(e[0]/e[1]).toFixed(1))},FocalLength:function(e){return e[0]/e[1]+" mm"},FocalPlaneResolutionUnit:function(e){return 2===e?"inches":3===e?"centimeters":4===e?"millimeters":"Unknown"},LightSource:function(e){return 1===e?"Daylight":2===e?"Fluorescent":3===e?"Tungsten (incandescent light)":4===e?"Flash":9===e?"Fine weather":10===e?"Cloudy weather":11===e?"Shade":12===e?"Daylight fluorescent (D 5700 – 7100K)":13===e?"Day white fluorescent (N 4600 – 5400K)":14===e?"Cool white fluorescent (W 3900 – 4500K)":15===e?"White fluorescent (WW 3200 – 3700K)":17===e?"Standard light A":18===e?"Standard light B":19===e?"Standard light C":20===e?"D55":21===e?"D65":22===e?"D75":23===e?"D50":24===e?"ISO studio tungsten":255===e?"Other light source":"Unknown"},MeteringMode:function(e){return 1===e?"Average":2===e?"CenterWeightedAverage":3===e?"Spot":4===e?"MultiSpot":5===e?"Pattern":6===e?"Partial":255===e?"Other":"Unknown"},ResolutionUnit:function(e){return 2===e?"inches":3===e?"centimeters":"Unknown"},Saturation:function(e){return 0===e?"Normal":1===e?"Low saturation":2===e?"High saturation":"Unknown"},FocalLengthIn35mmFilm:function(e){return 0===e?"Unknown":e+" mm"},SceneCaptureType:function(e){return 0===e?"Standard":1===e?"Landscape":2===e?"Portrait":3===e?"Night scene":"Unknown"},Sharpness:function(e){return 0===e?"Normal":1===e?"Soft":2===e?"Hard":"Unknown"},ShutterSpeedValue:function(e){var t=Math.pow(2,e[0]/e[1]);return t<=1?"".concat(Math.round(1/t)):"1/".concat(Math.round(t))},WhiteBalance:function(e){return 0===e?"Auto white balance":1===e?"Manual white balance":"Unknown"},XResolution:function(e){return""+Math.round(e[0]/e[1])},YResolution:function(e){return""+Math.round(e[0]/e[1])}};function tr(e){return 1===e?"Y":2===e?"Cb":3===e?"Cr":4===e?"R":5===e?"G":6===e?"B":void 0}var nr={11:"ProcessingSoftware",254:{name:"SubfileType",description:function(e){return Ce({0:"Full-resolution image",1:"Reduced-resolution image",2:"Single page of multi-page image",3:"Single page of multi-page reduced-resolution image",4:"Transparency mask",5:"Transparency mask of reduced-resolution image",6:"Transparency mask of multi-page image",7:"Transparency mask of reduced-resolution multi-page image",65537:"Alternate reduced-resolution image",4294967295:"Invalid"},e)}},255:{name:"OldSubfileType",description:function(e){return Ce({0:"Full-resolution image",1:"Reduced-resolution image",2:"Single page of multi-page image"},e)}},256:"ImageWidth",257:"ImageLength",258:"BitsPerSample",259:"Compression",262:"PhotometricInterpretation",263:{name:"Thresholding",description:function(e){return Ce({1:"No dithering or halftoning",2:"Ordered dither or halfton",3:"Randomized dither"},e)}},264:"CellWidth",265:"CellLength",266:{name:"FillOrder",description:function(e){return Ce({1:"Normal",2:"Reversed"},e)}},269:"DocumentName",270:"ImageDescription",271:"Make",272:"Model",273:"StripOffsets",274:{name:"Orientation",description:function(e){return 1===e?"top-left":2===e?"top-right":3===e?"bottom-right":4===e?"bottom-left":5===e?"left-top":6===e?"right-top":7===e?"right-bottom":8===e?"left-bottom":"Undefined"}},277:"SamplesPerPixel",278:"RowsPerStrip",279:"StripByteCounts",280:"MinSampleValue",281:"MaxSampleValue",282:{name:"XResolution",description:er.XResolution},283:{name:"YResolution",description:er.YResolution},284:"PlanarConfiguration",285:"PageName",286:{name:"XPosition",description:function(e){return""+Math.round(e[0]/e[1])}},287:{name:"YPosition",description:function(e){return""+Math.round(e[0]/e[1])}},290:{name:"GrayResponseUnit",description:function(e){return Ce({1:"0.1",2:"0.001",3:"0.0001",4:"1e-05",5:"1e-06"},e)}},296:{name:"ResolutionUnit",description:er.ResolutionUnit},297:"PageNumber",301:"TransferFunction",305:"Software",306:"DateTime",315:"Artist",316:"HostComputer",317:"Predictor",318:{name:"WhitePoint",description:function(e){return p(e,rr,", ")}},319:{name:"PrimaryChromaticities",description:function(e){return p(e,rr,", ")}},321:"HalftoneHints",322:"TileWidth",323:"TileLength",330:"A100DataOffset",332:{name:"InkSet",description:function(e){return Ce({1:"CMYK",2:"Not CMYK"},e)}},337:"TargetPrinter",338:{name:"ExtraSamples",description:function(e){return Ce({0:"Unspecified",1:"Associated Alpha",2:"Unassociated Alpha"},e)}},339:{name:"SampleFormat",description:function(e){return Array.isArray(e)?e.map(ir).join(", "):ir(e)}},513:"JPEGInterchangeFormat",514:"JPEGInterchangeFormatLength",529:{name:"YCbCrCoefficients",description:function(e){return e.map(function(e){return""+e[0]/e[1]}).join("/")}},530:"YCbCrSubSampling",531:{name:"YCbCrPositioning",description:function(e){return 1===e?"centered":2===e?"co-sited":"undefined "+e}},532:{name:"ReferenceBlackWhite",description:function(e){return e.map(function(e){return""+e[0]/e[1]}).join(", ")}},700:"ApplicationNotes",18246:"Rating",18249:"RatingPercent",33432:{name:"Copyright",description:function(e){return e.join("; ")}},33550:"PixelScale",33723:"IPTC-NAA",33920:"IntergraphMatrix",33922:"ModelTiePoint",34118:"SEMInfo",34264:"ModelTransform",34377:"PhotoshopSettings",34665:"Exif IFD Pointer",34675:"ICC_Profile",34735:"GeoTiffDirectory",34736:"GeoTiffDoubleParams",34737:"GeoTiffAsciiParams",34853:"GPS Info IFD Pointer",40091:{name:"XPTitle",description:or},40092:{name:"XPComment",description:or},40093:{name:"XPAuthor",description:or},40094:{name:"XPKeywords",description:or},40095:{name:"XPSubject",description:or},42112:"GDALMetadata",42113:"GDALNoData",50341:"PrintIM",50707:"DNGBackwardVersion",50708:"UniqueCameraModel",50709:"LocalizedCameraModel",50721:"ColorMatrix1",50722:"ColorMatrix2",50723:"CameraCalibration1",50724:"CameraCalibration2",50725:"ReductionMatrix1",50726:"ReductionMatrix2",50727:"AnalogBalance",50728:"AsShotNeutral",50729:"AsShotWhiteXY",50730:"BaselineExposure",50731:"BaselineNoise",50732:"BaselineSharpness",50734:"LinearResponseLimit",50735:"CameraSerialNumber",50736:"DNGLensInfo",50739:"ShadowScale",50741:{name:"MakerNoteSafety",description:function(e){return Ce({0:"Unsafe",1:"Safe"},e)}},50778:{name:"CalibrationIlluminant1",description:er.LightSource},50779:{name:"CalibrationIlluminant2",description:er.LightSource},50781:"RawDataUniqueID",50827:"OriginalRawFileName",50828:"OriginalRawFileData",50831:"AsShotICCProfile",50832:"AsShotPreProfileMatrix",50833:"CurrentICCProfile",50834:"CurrentPreProfileMatrix",50879:"ColorimetricReference",50885:"SRawType",50898:"PanasonicTitle",50899:"PanasonicTitle2",50931:"CameraCalibrationSig",50932:"ProfileCalibrationSig",50933:"ProfileIFD",50934:"AsShotProfileName",50936:"ProfileName",50937:"ProfileHueSatMapDims",50938:"ProfileHueSatMapData1",50939:"ProfileHueSatMapData2",50940:"ProfileToneCurve",50941:{name:"ProfileEmbedPolicy",description:function(e){return Ce({0:"Allow Copying",1:"Embed if Used",2:"Never Embed",3:"No Restrictions"},e)}},50942:"ProfileCopyright",50964:"ForwardMatrix1",50965:"ForwardMatrix2",50966:"PreviewApplicationName",50967:"PreviewApplicationVersion",50968:"PreviewSettingsName",50969:"PreviewSettingsDigest",50970:{name:"PreviewColorSpace",description:function(e){return Ce({1:"Gray Gamma 2.2",2:"sRGB",3:"Adobe RGB",4:"ProPhoto RGB"},e)}},50971:"PreviewDateTime",50972:"RawImageDigest",50973:"OriginalRawFileDigest",50981:"ProfileLookTableDims",50982:"ProfileLookTableData",51043:"TimeCodes",51044:"FrameRate",51058:"TStop",51081:"ReelName",51089:"OriginalDefaultFinalSize",51090:"OriginalBestQualitySize",51091:"OriginalDefaultCropSize",51105:"CameraLabel",51107:{name:"ProfileHueSatMapEncoding",description:function(e){return Ce({0:"Linear",1:"sRGB"},e)}},51108:{name:"ProfileLookTableEncoding",description:function(e){return Ce({0:"Linear",1:"sRGB"},e)}},51109:"BaselineExposureOffset",51110:{name:"DefaultBlackRender",description:function(e){return Ce({0:"Auto",1:"None"},e)}},51111:"NewRawImageDigest",51112:"RawToPreviewGain"};function rr(e){if(!Array.isArray(e))throw new TypeError("Expected a rational.");return"".concat(e[0],"/").concat(e[1])}function ir(e){return Ce({1:"Unsigned",2:"Signed",3:"Float",4:"Undefined",5:"Complex int",6:"Complex float"},e)}function or(e){return Array.isArray(e)?function(e){for(var t=e.length;t>0&&0===e.charCodeAt(t-1);)t--;return e.slice(0,t)}(new TextDecoder("utf-16").decode(new Uint8Array(e))):""}function ar(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var ur={33434:{name:"ExposureTime",description:er.ExposureTime},33437:{name:"FNumber",description:er.FNumber},34850:{name:"ExposureProgram",description:er.ExposureProgram},34852:"SpectralSensitivity",34855:"ISOSpeedRatings",34856:{name:"OECF",description:function(){return"[Raw OECF table data]"}},34858:"TimeZoneOffset",34859:"SelfTimerMode",34864:{name:"SensitivityType",description:function(e){return Ce({1:"Standard Output Sensitivity",2:"Recommended Exposure Index",3:"ISO Speed",4:"Standard Output Sensitivity and Recommended Exposure Index",5:"Standard Output Sensitivity and ISO Speed",6:"Recommended Exposure Index and ISO Speed",7:"Standard Output Sensitivity, Recommended Exposure Index and ISO Speed"},e)}},34865:"StandardOutputSensitivity",34866:"RecommendedExposureIndex",34867:"ISOSpeed",34868:"ISOSpeedLatitudeyyy",34869:"ISOSpeedLatitudezzz",36864:{name:"ExifVersion",description:Te},36867:"DateTimeOriginal",36868:"DateTimeDigitized",36873:"GooglePlusUploadCode",36880:"OffsetTime",36881:"OffsetTimeOriginal",36882:"OffsetTimeDigitized",37121:{name:"ComponentsConfiguration",description:er.ComponentsConfiguration},37122:"CompressedBitsPerPixel",37377:{name:"ShutterSpeedValue",description:er.ShutterSpeedValue},37378:{name:"ApertureValue",description:er.ApertureValue},37379:"BrightnessValue",37380:"ExposureBiasValue",37381:{name:"MaxApertureValue",description:function(e){return Math.pow(Math.sqrt(2),e[0]/e[1]).toFixed(2)}},37382:{name:"SubjectDistance",description:function(e){return e[0]/e[1]+" m"}},37383:{name:"MeteringMode",description:er.MeteringMode},37384:{name:"LightSource",description:er.LightSource},37385:{name:"Flash",description:function(e){return 0===e?"Flash did not fire":1===e?"Flash fired":5===e?"Strobe return light not detected":7===e?"Strobe return light detected":9===e?"Flash fired, compulsory flash mode":13===e?"Flash fired, compulsory flash mode, return light not detected":15===e?"Flash fired, compulsory flash mode, return light detected":16===e?"Flash did not fire, compulsory flash mode":24===e?"Flash did not fire, auto mode":25===e?"Flash fired, auto mode":29===e?"Flash fired, auto mode, return light not detected":31===e?"Flash fired, auto mode, return light detected":32===e?"No flash function":65===e?"Flash fired, red-eye reduction mode":69===e?"Flash fired, red-eye reduction mode, return light not detected":71===e?"Flash fired, red-eye reduction mode, return light detected":73===e?"Flash fired, compulsory flash mode, red-eye reduction mode":77===e?"Flash fired, compulsory flash mode, red-eye reduction mode, return light not detected":79===e?"Flash fired, compulsory flash mode, red-eye reduction mode, return light detected":89===e?"Flash fired, auto mode, red-eye reduction mode":93===e?"Flash fired, auto mode, return light not detected, red-eye reduction mode":95===e?"Flash fired, auto mode, return light detected, red-eye reduction mode":"Unknown"}},37386:{name:"FocalLength",description:er.FocalLength},37393:"ImageNumber",37394:{name:"SecurityClassification",description:function(e){return Ce({C:"Confidential",R:"Restricted",S:"Secret",T:"Top Secret",U:"Unclassified"},e)}},37395:"ImageHistory",37396:{name:"SubjectArea",description:function(e){return 2===e.length?"Location; X: ".concat(e[0],", Y: ").concat(e[1]):3===e.length?"Circle; X: ".concat(e[0],", Y: ").concat(e[1],", diameter: ").concat(e[2]):4===e.length?"Rectangle; X: ".concat(e[0],", Y: ").concat(e[1],", width: ").concat(e[2],", height: ").concat(e[3]):"Unknown"}},37500:{name:"MakerNote",description:function(){return"[Raw maker note data]"}},37510:{name:"UserComment",description:Pe},37520:"SubSecTime",37521:"SubSecTimeOriginal",37522:"SubSecTimeDigitized",37724:"ImageSourceData",37888:{name:"AmbientTemperature",description:function(e){return e[0]/e[1]+" °C"}},37889:{name:"Humidity",description:function(e){return e[0]/e[1]+" %"}},37890:{name:"Pressure",description:function(e){return e[0]/e[1]+" hPa"}},37891:{name:"WaterDepth",description:function(e){return e[0]/e[1]+" m"}},37892:{name:"Acceleration",description:function(e){return e[0]/e[1]+" mGal"}},37893:{name:"CameraElevationAngle",description:function(e){return e[0]/e[1]+" °"}},40960:{name:"FlashpixVersion",description:Te},40961:{name:"ColorSpace",description:er.ColorSpace},40962:"PixelXDimension",40963:"PixelYDimension",40964:"RelatedSoundFile",40965:"Interoperability IFD Pointer",41483:"FlashEnergy",41484:{name:"SpatialFrequencyResponse",description:function(){return"[Raw SFR table data]"}},41486:"FocalPlaneXResolution",41487:"FocalPlaneYResolution",41488:{name:"FocalPlaneResolutionUnit",description:er.FocalPlaneResolutionUnit},41492:{name:"SubjectLocation",description:function(e){var t,n=function(e){if(Array.isArray(e))return e}(t=e)||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(t)||function(e){if(e){if("string"==typeof e)return ar(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?ar(e,2):void 0}}(t)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),r=n[0],i=n[1];return"X: ".concat(r,", Y: ").concat(i)}},41493:"ExposureIndex",41495:{name:"SensingMethod",description:function(e){return 1===e?"Undefined":2===e?"One-chip color area sensor":3===e?"Two-chip color area sensor":4===e?"Three-chip color area sensor":5===e?"Color sequential area sensor":7===e?"Trilinear sensor":8===e?"Color sequential linear sensor":"Unknown"}},41728:{name:"FileSource",description:function(e){return 3===e?"DSC":"Unknown"}},41729:{name:"SceneType",description:function(e){return 1===e?"A directly photographed image":"Unknown"}},41730:{name:"CFAPattern",description:function(){return"[Raw CFA pattern table data]"}},41985:{name:"CustomRendered",description:er.CustomRendered},41986:{name:"ExposureMode",description:er.ExposureMode},41987:{name:"WhiteBalance",description:er.WhiteBalance},41988:{name:"DigitalZoomRatio",description:function(e){return 0===e[0]?"Digital zoom was not used":""+e[0]/e[1]}},41989:{name:"FocalLengthIn35mmFilm",description:er.FocalLengthIn35mmFilm},41990:{name:"SceneCaptureType",description:er.SceneCaptureType},41991:{name:"GainControl",description:function(e){return 0===e?"None":1===e?"Low gain up":2===e?"High gain up":3===e?"Low gain down":4===e?"High gain down":"Unknown"}},41992:{name:"Contrast",description:er.Contrast},41993:{name:"Saturation",description:er.Saturation},41994:{name:"Sharpness",description:er.Sharpness},41995:{name:"DeviceSettingDescription",description:function(){return"[Raw device settings table data]"}},41996:{name:"SubjectDistanceRange",description:function(e){return 1===e?"Macro":2===e?"Close view":3===e?"Distant view":"Unknown"}},42016:"ImageUniqueID",42032:"CameraOwnerName",42033:"BodySerialNumber",42034:{name:"LensSpecification",description:function(e){return"".concat((n=e[0],r=e[1],i=fr(n),o=fr(r),0===o||o===i?"".concat(i):"".concat(i,"-").concat(o))," mm f/").concat(0===(t=[e[2],e[3]].filter(sr).map(fr)).length?"?":1===t.length||0===t[1]||t[1]===t[0]?"".concat(t[0]):"".concat(t[0],"-").concat(t[1]));var t,n,r,i,o}},42035:"LensMake",42036:"LensModel",42037:"LensSerialNumber",42080:{name:"CompositeImage",description:function(e){return Ce({1:"Not a Composite Image",2:"General Composite Image",3:"Composite Image Captured While Shooting"},e)}},42081:"SourceImageNumberOfCompositeImage",42082:"SourceExposureTimesOfCompositeImage",42240:"Gamma",59932:"Padding",59933:"OffsetSchema",65e3:"OwnerName",65001:"SerialNumber",65002:"Lens",65100:"RawFile",65101:"Converter",65102:"WhiteBalance",65105:"Exposure",65106:"Shadows",65107:"Brightness",65108:"Contrast",65109:"Saturation",65110:"Sharpness",65111:"Smoothness",65112:"MoireFilter"};function fr(e){return parseFloat((e[0]/e[1]).toFixed(5))}function sr(e){return 0!==e[1]}function cr(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var lr={0:{name:"GPSVersionID",description:function(e){return 2===e[0]&&2===e[1]&&0===e[2]&&0===e[3]?"Version 2.2":"Unknown"}},1:{name:"GPSLatitudeRef",description:function(e){var t=e.join("");return"N"===t?"North latitude":"S"===t?"South latitude":"Unknown"}},2:{name:"GPSLatitude",description:Ue},3:{name:"GPSLongitudeRef",description:function(e){var t=e.join("");return"E"===t?"East longitude":"W"===t?"West longitude":"Unknown"}},4:{name:"GPSLongitude",description:Ue},5:{name:"GPSAltitudeRef",description:function(e){return 0===e?"Sea level":1===e?"Sea level reference (negative value)":"Unknown"}},6:{name:"GPSAltitude",description:function(e){return e[0]/e[1]+" m"}},7:{name:"GPSTimeStamp",description:function(e){return e.map(function(e){var t,n=function(e){if(Array.isArray(e))return e}(t=e)||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(t)||function(e){if(e){if("string"==typeof e)return cr(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?cr(e,2):void 0}}(t)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),r=n[0]/n[1];return/^\d(\.|$)/.test("".concat(r))?"0".concat(r):r}).join(":")}},8:"GPSSatellites",9:{name:"GPSStatus",description:function(e){var t=e.join("");return"A"===t?"Measurement in progress":"V"===t?"Measurement Interoperability":"Unknown"}},10:{name:"GPSMeasureMode",description:function(e){var t=e.join("");return"2"===t?"2-dimensional measurement":"3"===t?"3-dimensional measurement":"Unknown"}},11:"GPSDOP",12:{name:"GPSSpeedRef",description:function(e){var t=e.join("");return"K"===t?"Kilometers per hour":"M"===t?"Miles per hour":"N"===t?"Knots":"Unknown"}},13:"GPSSpeed",14:{name:"GPSTrackRef",description:function(e){var t=e.join("");return"T"===t?"True direction":"M"===t?"Magnetic direction":"Unknown"}},15:"GPSTrack",16:{name:"GPSImgDirectionRef",description:function(e){var t=e.join("");return"T"===t?"True direction":"M"===t?"Magnetic direction":"Unknown"}},17:"GPSImgDirection",18:"GPSMapDatum",19:{name:"GPSDestLatitudeRef",description:function(e){var t=e.join("");return"N"===t?"North latitude":"S"===t?"South latitude":"Unknown"}},20:{name:"GPSDestLatitude",description:function(e){return e[0][0]/e[0][1]+e[1][0]/e[1][1]/60+e[2][0]/e[2][1]/3600}},21:{name:"GPSDestLongitudeRef",description:function(e){var t=e.join("");return"E"===t?"East longitude":"W"===t?"West longitude":"Unknown"}},22:{name:"GPSDestLongitude",description:function(e){return e[0][0]/e[0][1]+e[1][0]/e[1][1]/60+e[2][0]/e[2][1]/3600}},23:{name:"GPSDestBearingRef",description:function(e){var t=e.join("");return"T"===t?"True direction":"M"===t?"Magnetic direction":"Unknown"}},24:"GPSDestBearing",25:{name:"GPSDestDistanceRef",description:function(e){var t=e.join("");return"K"===t?"Kilometers":"M"===t?"Miles":"N"===t?"Knots":"Unknown"}},26:"GPSDestDistance",27:{name:"GPSProcessingMethod",description:Pe},28:{name:"GPSAreaInformation",description:Pe},29:"GPSDateStamp",30:{name:"GPSDifferential",description:function(e){return 0===e?"Measurement without differential correction":1===e?"Differential correction applied":"Unknown"}},31:"GPSHPositioningError"},dr={1:"InteroperabilityIndex",2:{name:"InteroperabilityVersion",description:Te},4096:"RelatedImageFileFormat",4097:"RelatedImageWidth",4098:"RelatedImageHeight"},pr={45056:{name:"MPFVersion",description:Te},45057:"NumberOfImages",45058:"MPEntry",45059:"ImageUIDList",45060:"TotalFrames"};function gr(e){return gr="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},gr(e)}function hr(e,t,n){return(t=function(e){var t=function(e){if("object"!=gr(e)||!e)return e;var t=e[Symbol.toPrimitive];if(void 0!==t){var n=t.call(e,"string");if("object"!=gr(n))return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return e+""}(e);return"symbol"==gr(t)?t:t+""}(t))in e?Object.defineProperty(e,t,{value:n,enumerable:1,configurable:1,writable:1}):e[t]=n,e}var mr=Ae.USE_EXIF?S({},nr,ur):{},vr="0th",yr="exif",br="interoperability",Sr="canon",xr="pentax",Ir=hr(hr(hr(hr(hr(hr(hr(hr({},vr,mr),"1st",Ae.USE_EXIF?nr:{}),yr,mr),"gps",Ae.USE_EXIF?lr:{}),br,Ae.USE_EXIF?dr:{}),"mpf",Ae.USE_MPF?pr:{}),Sr,Ae.USE_MAKER_NOTES?{1:{name:"CameraSettings",description:function(e){return e}},4:{name:"ShotInfo",description:function(e){return e}},149:"LensModel"}:{}),xr,Ae.USE_MAKER_NOTES?{0:{name:"PentaxVersion",description:function(e){return e.join(".")}},5:"PentaxModelID",555:"LevelInfo"}:{}),Ar={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,13:4},Pr={BYTE:1,ASCII:2,SHORT:3,LONG:4,RATIONAL:5,UNDEFINED:7,SLONG:9,SRATIONAL:10,IFD:13},Tr={getByteAt:Er,getAsciiAt:function(e,t){return e.getUint8(t)},getShortAt:function(e,t,n){return e.getUint16(t,n===Me.LITTLE_ENDIAN)},getLongAt:Cr,getRationalAt:function(e,t,n){return[Cr(e,t,n),Cr(e,t+4,n)]},getUndefinedAt:function(e,t){return Er(e,t)},getSlongAt:Ur,getSrationalAt:function(e,t,n){return[Ur(e,t,n),Ur(e,t+4,n)]},getIfdPointerAt:function(e,t,n){return Cr(e,t,n)},typeSizes:Ar,tagTypes:Pr,getTypeSize:function(e){if(void 0===Pr[e])throw Error("No such type found.");return Ar[Pr[e]]}};function Er(e,t){return e.getUint8(t)}function Cr(e,t,n){return e.getUint32(t,n===Me.LITTLE_ENDIAN)}function Ur(e,t,n){return e.getInt32(t,n===Me.LITTLE_ENDIAN)}var Or={exif:1,iptc:1,photoshop:1,mpf:1,makerNotes:1},wr={exif:1,iptc:1,xmp:1,icc:1,photoshop:1,makerNotes:1,mpf:1,file:1,jfif:1,png:1,riff:1,gif:1,gps:1,composite:1,thumbnail:1},Mr={exifIfdPointer:"Exif IFD Pointer",gpsInfoIfdPointer:"GPS Info IFD Pointer",interoperabilityIfdPointer:"Interoperability IFD Pointer"},Lr=Rr([[0,31]]),Fr=Rr([[1,2],[4096,4098]]);function Rr(e){for(var t=Object.create(null),n=0;n<e.length;n++)for(var r=e[n][0];r<=e[n][1];r++)t[r]=1;return t}var Dr={thumbnail:["JPEGInterchangeFormat","JPEGInterchangeFormatLength"],iptc:["IPTC-NAA"],xmp:["ApplicationNotes"],icc:["ICC_Profile"],photoshop:["ImageSourceData","PhotoshopSettings"],makerNotes:["MakerNote","Make"],gps:["GPSLatitude","GPSLatitudeRef","GPSLongitude","GPSLongitudeRef","GPSAltitude","GPSAltitudeRef"]},Nr={file:["Image Width","Image Height"],exif:["FocalLength","FocalPlaneXResolution","FocalPlaneYResolution","FocalPlaneResolutionUnit","FocalLengthIn35mmFilm","PixelXDimension","PixelYDimension"]};function Gr(e){return 1==e?1:Array.isArray(e)&&e.length>0}function kr(){return{isActive:0,shouldReturnGroup:e,shouldParseGroup:e,shouldReturnTag:e,shouldParseTag:e};function e(){return 1}}var _r=kr();function Br(e){var t=e.groupKey,n=e.hasIncludeTags,r=e.hasIncludeEntry,i=e.includeTags,o=e.shouldParseExif,a=e.shouldParseFile;return n?r?"thumbnail"===t&&Array.isArray(i[t])?1:i[t]:"exif"===t&&o||"file"===t&&a?[]:void 0:1}function jr(e){var t=e.groupKey,n=e.hasIncludeTags,r=e.hasIncludeEntry,i=e.shouldParseExif,o=e.shouldParseFile,a=e.exifIncludeDependencies,u=e.fileIncludeDependencies;return n?"exif"===t&&(i||r&&Object.keys(a).length>0)?a:"file"===t&&o?u:Object.create(null):Object.create(null)}function zr(e,t){if(!e||!Object.prototype.hasOwnProperty.call(e,t))return 0;var n=e[t];return 1==n?1:Array.isArray(n)&&n.length>0}function Vr(e){return Array.isArray(e)&&0===e.length}function Xr(e){var t=e.groupKey,n=e.includeValue,r=e.excludeValue,i=e.extraIncludeNames,o=!!Or[t],a={includeAll:0,includeNames:void 0,includeIds:void 0,excludeAll:0,excludeNames:void 0,excludeIds:void 0};if(1==n)a.includeAll=1;else if(Array.isArray(n)){a.includeNames=Object.create(null),o&&(a.includeIds=Object.create(null));for(var u=0;u<n.length;u++)l(a,n[u]);for(var f in i)a.includeNames[f.toLowerCase()]=1}else if(i&&Object.keys(i).length>0)for(var s in a.includeNames=Object.create(null),i)a.includeNames[s.toLowerCase()]=1;if(1==r)return a.excludeAll=1,a;if(Array.isArray(r)){a.excludeNames=Object.create(null),o&&(a.excludeIds=Object.create(null));for(var c=0;c<r.length;c++)d(a,r[c])}return a;function l(e,t){"number"==typeof t&&e.includeIds?e.includeIds[t+""]=1:"string"==typeof t&&(e.includeNames[t.toLowerCase()]=1)}function d(e,t){"number"==typeof t&&e.excludeIds?e.excludeIds[t+""]=1:"string"==typeof t&&(e.excludeNames[t.toLowerCase()]=1)}}function Hr(e,t,n){return e.excludeAll?0:e.includeAll?!Wr(e,t,n):e.includeNames||e.includeIds?function(e,t,n){return void 0!==n&&e.includeIds&&e.includeIds[n+""]||t&&e.includeNames&&e.includeNames[(t+"").toLowerCase()]?1:0}(e,t,n)?!Wr(e,t,n):0:!Wr(e,t,n)}function Wr(e,t,n){return void 0!==n&&e.excludeIds&&e.excludeIds[n+""]||t&&e.excludeNames&&e.excludeNames[(t+"").toLowerCase()]?1:0}var Kr=4,Jr=1048576,qr=4,Yr=48,$r=1024,Zr=8192,Qr={1:Tr.getByteAt,3:Tr.getShortAt,4:Tr.getLongAt,5:Tr.getRationalAt,7:Tr.getUndefinedAt,9:Tr.getSlongAt,10:Tr.getSrationalAt,13:Tr.getIfdPointerAt};function ei(e,t,n){var r=t+4;if(!(r+Tr.getTypeSize("LONG")>e.byteLength)){var i=Tr.getLongAt(e,r,n);if(!(i<8))return t+i}}function ti(e,t,n,r,i,o){var a=arguments.length>6&&void 0!==arguments[6]?arguments[6]:0,u=arguments.length>7&&void 0!==arguments[7]?arguments[7]:_r,f=arguments.length>8&&void 0!==arguments[8]?arguments[8]:"exif",s=arguments.length>9&&void 0!==arguments[9]?arguments[9]:ri(e),c=Tr.getTypeSize("SHORT"),l=st,d={},p=function(e,t,n){return t+Tr.getTypeSize("SHORT")<=e.byteLength?Tr.getShortAt(e,t,n):0}(e,r,i),g=0;r+=c;for(var h=0;h<p;h++){if(r+l>e.byteLength){g=1;break}if(!ni(s)){g=1;break}var m=oi(e,t,n,r,i,o,u,f,s);void 0!==m&&(d[m.name]={id:m.id,value:m.value,description:m.description},a&&(d[m.name].computed=si(m.tagType,m.value)),("MakerNote"===m.name||t===xr&&"LevelInfo"===m.name)&&(d[m.name].__offset=m.__offset)),r+=l}if(Ae.USE_THUMBNAIL&&!g&&r+Tr.getTypeSize("LONG")<=e.byteLength){var v=Tr.getLongAt(e,r,i);v>=8&&t===vr&&u.shouldParseGroup("thumbnail")&&(d.Thumbnail=ti(e,"1st",n,n+v,i,o,a,u,"thumbnail",s))}return d}function ni(e){return e.ifdEntriesRemaining>0?(e.ifdEntriesRemaining--,1):0}function ri(e){return{remaining:e.byteLength*Kr,ifdEntriesRemaining:Math.floor(e.byteLength/st)*qr,decompressedAllowanceRemaining:Jr,iptcDatasetsRemaining:$r+Math.floor(e.byteLength/Yr),decompressedIptcAllowanceRemaining:Zr}}function ii(e,t){if(void 0!==e){var n=Math.min(t*Kr,e.decompressedAllowanceRemaining);e.remaining+=n,e.decompressedAllowanceRemaining-=n}}function oi(e,t,n,r,i){var o,a,u,f=arguments.length>5&&void 0!==arguments[5]?arguments[5]:0,s=arguments.length>6&&void 0!==arguments[6]?arguments[6]:_r,c=arguments.length>7&&void 0!==arguments[7]?arguments[7]:"exif",d=arguments.length>8?arguments[8]:void 0,p=Tr.getTypeSize("SHORT"),g=p+Tr.getTypeSize("SHORT"),m=g+Tr.getTypeSize("LONG"),v=Tr.getShortAt(e,r,i),y=Tr.getShortAt(e,r+p,i),b=Tr.getLongAt(e,r+g,i);if(void 0!==Tr.typeSizes[y]&&(f||void 0!==Ir[t][v])){var S=function(e,t){if(void 0!==Ir[e][t]){if("string"==typeof Ir[e][t])return Ir[e][t];if(Ir[e][t].name)return Ir[e][t].name}return"undefined-".concat(t)}(t,v);if(s.shouldParseTag(c,S,v)){if(function(e,t){return Tr.typeSizes[e]*t<=Tr.getTypeSize("LONG")}(y,b))o=ai(e,n+(a=r+m-n),y,b,i);else if(function(e,t,n,r,i){return t+n+Tr.typeSizes[r]*i<=e.byteLength}(e,n,a=Tr.getLongAt(e,r+m,i),y,b)){var x=33723===v,I=function(e,t,n){var r=Math.min(n,Math.floor(e/Tr.typeSizes[t]));return 1===r&&n>1?0:r}(d.remaining,y,b);d.remaining-=I*Tr.typeSizes[y],u=d,o=ai(e,n+a,y,I,i,x)}else o="<faulty value>";y===Tr.tagTypes.ASCII&&(o=function(e,t){return e instanceof Uint8Array?function(e,t){for(var n=[],r=[],i=0,o=0,a=0,u=0;u<=e.length;u++)if(u===e.length||0===e[u]){if(u>a){if(i&&!ui(t))break;n[o]=h(l(e,a,u,r)),i=1}o++,a=u+1}return n}(e,t):"string"==typeof e?[e]:e.length>0?[h(e.join(""))]:[]}(o,u));var A=o;if(void 0!==Ir[t][v])if(void 0!==Ir[t][v].name&&void 0!==Ir[t][v].description)try{A=Ir[t][v].description(o)}catch(e){A=fi(o)}else A=y===Tr.tagTypes.RATIONAL||y===Tr.tagTypes.SRATIONAL?""+o[0]/o[1]:fi(o);return{id:v,name:S,value:o,description:A,tagType:y,__offset:a}}}}function ai(e,t,n,r,i){var o=[];if((arguments.length>5&&void 0!==arguments[5]?arguments[5]:0)&&(r*=Tr.typeSizes[n],n=Tr.tagTypes.BYTE),n===Tr.tagTypes.ASCII)return function(e,t,n){for(var r=new Uint8Array(n),i=0;i<n;i++)r[i]=Tr.getAsciiAt(e,t+i);return r}(e,t,r);for(var a=0;a<r;a++)o.push(Qr[n](e,t,i)),t+=Tr.typeSizes[n];return 1===o.length?o[0]:o}function ui(e){return void 0===e?1:e.remaining<2?0:(e.remaining-=2,1)}function fi(e){return e instanceof Array?e.join(", "):e}function si(e,t){return e===Tr.tagTypes.ASCII?Array.isArray(t)&&1===t.length?t[0]:t:e===Tr.tagTypes.RATIONAL||e===Tr.tagTypes.SRATIONAL?function(e){return Array.isArray(e)&&2===e.length?"number"==typeof e[0]&&"number"==typeof e[1]:0}(t)?ci(t):Array.isArray(t)?t.map(function(e){return ci(e)}):t:t}function ci(e){if(!Array.isArray(e)||2!==e.length)return e;var t=e[0],n=e[1];return Number.isFinite(t)&&Number.isFinite(n)?0===n?null:t/n:e}function li(e,t,n,r){var i=e.Thumbnail;if(i&&(delete e.Thumbnail,r)){var o=r(t,i,n);return o.image?o:void 0}}var di=[{pointerKey:"Exif IFD Pointer",ifdType:yr},{pointerKey:"GPS Info IFD Pointer",ifdType:"gps"},{pointerKey:"Interoperability IFD Pointer",ifdType:br}],pi={read:function(e,t,n){for(var r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:0,i=arguments.length>4&&void 0!==arguments[4]?arguments[4]:void 0,o=arguments.length>5&&void 0!==arguments[5]?arguments[5]:ri(e),a=Me.getByteOrder(e,t),u=function(e,t,n,r,i,o,a){var u=ei(e,t,n);return void 0===u?{}:ti(e,vr,t,u,n,r,i,o,"exif",a)}(e,t,a,n,r,i,o),f=0;f<di.length;f++)u=gi(di[f],u,e,t,a,n,r,i,o);return{tags:u,byteOrder:a}}};function gi(e,t,n,r,i,o,a,u,f){var s,c=t[e.pointerKey];return void 0===c?t:"number"==typeof(s=c.value)&&s>=8&&s%1==0?S(t,ti(n,e.ifdType,r,r+c.value,i,o,a,u,"exif",f)):t}var hi={read:function(e,t,n){var r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:0,i=arguments.length>4&&void 0!==arguments[4]?arguments[4]:void 0,o=arguments.length>5&&void 0!==arguments[5]?arguments[5]:void 0;try{var a=Me.getByteOrder(e,t),u=ei(e,t,a);return void 0===u?{}:function(e,t,n,r){if(!n.MPEntry)return n;for(var i=e.byteLength,o=e.byteOffset||0,a=i*vi,u=[],f=Math.min(Math.ceil(n.MPEntry.value.length/mi),yi),s=0;s<f;s++){u[s]={};var c=bi(n.MPEntry.value,s*mi,Tr.getTypeSize("LONG"),r);u[s].ImageFlags=Si(c),u[s].ImageFormat=xi(c),u[s].ImageType=Ii(c);var l=bi(n.MPEntry.value,s*mi+4,Tr.getTypeSize("LONG"),r);u[s].ImageSize={value:l,description:""+l};var d=Ai(s,n.MPEntry,r,t);u[s].ImageOffset={value:d,description:""+d};var p=bi(n.MPEntry.value,s*mi+12,Tr.getTypeSize("SHORT"),r);u[s].DependentImage1EntryNumber={value:p,description:""+p};var g=bi(n.MPEntry.value,s*mi+14,Tr.getTypeSize("SHORT"),r);u[s].DependentImage2EntryNumber={value:g,description:""+g};var h=Math.min(Math.max(d,0),i),m=Math.min(h+Math.max(l,0),i,h+a);u[s].image=e.buffer.slice(o+h,o+m),a-=m-h,A(u[s],"base64",function(){return P(this.image)})}return n.Images=u,n}(e,t,ti(e,"mpf",t,u,a,n,r,i,"mpf",o),a)}catch(e){return{}}}},mi=16,vi=8,yi=256;function bi(e,t,n,r){if(r===Me.LITTLE_ENDIAN){for(var i=0,o=0;o<n;o++)i+=e[t+o]<<8*o;return i}for(var a=0,u=0;u<n;u++)a+=e[t+u]<<8*(n-1-u);return a}function Si(e){var t=[e>>31&1,e>>30&1,e>>29&1],n=[];return t[0]&&n.push("Dependent Parent Image"),t[1]&&n.push("Dependent Child Image"),t[2]&&n.push("Representative Image"),{value:t,description:n.join(", ")||"None"}}function xi(e){var t=e>>24&7;return{value:t,description:0===t?"JPEG":"Unknown"}}function Ii(e){var t=16777215&e;return{value:t,description:{196608:"Baseline MP Primary Image",65537:"Large Thumbnail (VGA equivalent)",65538:"Large Thumbnail (Full HD equivalent)",131073:"Multi-Frame Image (Panorama)",131074:"Multi-Frame Image (Disparity)",131075:"Multi-Frame Image (Multi-Angle)",0:"Undefined"}[t]||"Unknown"}}function Ai(e,t,n,r){return function(e){return 0===e}(e)?0:bi(t.value,e*mi+8,Tr.getTypeSize("LONG"),n)+r}var Pi={read:function(e,t){var n=function(e,t){return Math.min(Tr.getShortAt(e,t),e.byteLength-t)}(e,t),r=function(e,t,n){if(!(8>n)){var r=Tr.getByteAt(e,t+7);return{value:r,description:""+r}}}(e,t,n);return{"Bits Per Sample":Ti(e,t,n),"Image Height":Ei(e,t,n),"Image Width":Ci(e,t,n),"Color Components":r,Subsampling:r&&Ui(e,t,r.value,n)}}};function Ti(e,t,n){if(!(3>n)){var r=Tr.getByteAt(e,t+2);return{value:r,description:""+r}}}function Ei(e,t,n){if(!(5>n)){var r=Tr.getShortAt(e,t+3);return{value:r,description:"".concat(r,"px")}}}function Ci(e,t,n){if(!(7>n)){var r=Tr.getShortAt(e,t+5);return{value:r,description:"".concat(r,"px")}}}function Ui(e,t,n,r){if(!(8+3*n>r)){for(var i=[],o=0;o<n;o++){var a=t+8+3*o;i.push([Tr.getByteAt(e,a),Tr.getByteAt(e,a+1),Tr.getByteAt(e,a+2)])}return{value:i,description:i.length>1?Oi(i)+wi(i):""}}}function Oi(e){var t={1:"Y",2:"Cb",3:"Cr",4:"I",5:"Q"};return e.map(function(e){return t[e[0]]}).join("")}function wi(e){var t={17:"4:4:4 (1 1)",18:"4:4:0 (1 2)",20:"4:4:1 (1 4)",33:"4:2:2 (2 1)",34:"4:2:0 (2 2)",36:"4:2:1 (2 4)",65:"4:1:1 (4 1)",66:"4:1:0 (4 2)"};return 0===e.length||void 0===e[0][1]||void 0===t[e[0][1]]?"":t[e[0][1]]}var Mi={read:function(e,t){var n={};try{var r=function(e,t){var n=t,r=0;return{readBits:function(t){for(var i=0,o=0;o<t;o++){if(n>=e.byteLength)throw Error("Unexpected end of data");i|=(e.getUint8(n)>>r&1)<<o,++r>=8&&(r=0,n++)}return i}}}(e,t+Li),i=function(e){var t,n;if(e.readBits(1)){t=8*(e.readBits(5)+1);var r=e.readBits(3);n=0===r?8*(e.readBits(5)+1):Math.ceil(t*Ri[r])}else{t=Di(e);var i=e.readBits(3);n=0===i?Di(e):Math.ceil(t*Ri[i])}return{height:t,width:n}}(r),o=i.height,a=i.width;n["Image Height"]={value:o,description:"".concat(o,"px")},n["Image Width"]={value:a,description:"".concat(a,"px")}}catch(e){}return n}},Li=2,Fi=[9,13,18,30],Ri=[0,1,1.2,4/3,1.5,16/9,5/4,2];function Di(e){var t=e.readBits(2);return 1+e.readBits(Fi[t])}var Ni={read:function(e,t,n){var r={};return void 0!==t&&S(r,function(e,t){if(!Le(e,t,Gi))return{};var n=e.getUint32(t),r=e.getUint32(t+ki);return{"Image Width":{value:n,description:"".concat(n,"px")},"Image Height":{value:r,description:"".concat(r,"px")}}}(e,t)),void 0!==n&&S(r,function(e,t){if(!Le(e,t,_i))return{};var n=e.getUint8(t),r=t+_i;if(!Le(e,r,n))return{};var i={"Color Components":{value:n,description:"".concat(n)}},o=function(e,t,n){if(0!==n){for(var r=e.getUint8(t),i=1;i<n;i++)if(e.getUint8(t+i)!==r)return;return r}}(e,r,n);return void 0!==o&&(i["Bits Per Sample"]={value:o,description:"".concat(o)}),i}(e,n)),r}},Gi=8,ki=4,_i=1,Bi={read:function(e,t){var n=function(e,t){return Math.min(Tr.getShortAt(e,t),e.byteLength-t)}(e,t),r=function(e,t,n){if(!(15>n)){var r=Tr.getByteAt(e,t+14);return{value:r,description:"".concat(r,"px")}}}(e,t,n),i=function(e,t,n){if(!(16>n)){var r=Tr.getByteAt(e,t+15);return{value:r,description:"".concat(r,"px")}}}(e,t,n),o={"JFIF Version":ji(e,t,n),"Resolution Unit":zi(e,t,n),XResolution:Xi(e,t,n),YResolution:Hi(e,t,n),"JFIF Thumbnail Width":r,"JFIF Thumbnail Height":i};if(void 0!==r&&void 0!==i){var a=function(e,t,n,r){if(!(0===n||16+n>r)){var i=e.byteOffset||0;return{value:e.buffer.slice(i+t+16,i+t+16+n),description:"<24-bit RGB pixel data>"}}}(e,t,3*r.value*i.value,n);a&&(o["JFIF Thumbnail"]=a)}for(var u in o)void 0===o[u]&&delete o[u];return o}};function ji(e,t,n){if(!(9>n)){var r=Tr.getByteAt(e,t+7),i=Tr.getByteAt(e,t+7+1);return{value:256*r+i,description:r+"."+i}}}function zi(e,t,n){if(!(10>n)){var r=Tr.getByteAt(e,t+9);return{value:r,description:Vi(r)}}}function Vi(e){return 0===e?"None":1===e?"inches":2===e?"cm":"Unknown"}function Xi(e,t,n){if(!(12>n)){var r=Tr.getShortAt(e,t+10);return{value:r,description:""+r}}}function Hi(e,t,n){if(!(14>n)){var r=Tr.getShortAt(e,t+12);return{value:r,description:""+r}}}var Wi={iptc:{256:{name:"Model Version",description:function(e){return""+((e[0]<<8)+e[1])}},261:{name:"Destination",repeatable:1},276:{name:"File Format",description:function(e){return""+((e[0]<<8)+e[1])}},278:{name:"File Format Version",description:function(e){return""+((e[0]<<8)+e[1])}},286:"Service Identifier",296:"Envelope Number",306:"Product ID",316:"Envelope Priority",326:{name:"Date Sent",description:Ki},336:{name:"Time Sent",description:Ji},346:{name:"Coded Character Set",description:qi,encoding_name:qi},356:"UNO",376:{name:"ARM Identifier",description:function(e){return""+((e[0]<<8)+e[1])}},378:{name:"ARM Version",description:function(e){return""+((e[0]<<8)+e[1])}},512:{name:"Record Version",description:function(e){return""+((e[0]<<8)+e[1])}},515:"Object Type Reference",516:"Object Attribute Reference",517:"Object Name",519:"Edit Status",520:{name:"Editorial Update",description:function(e){return"01"===c(e)?"Additional Language":"Unknown"}},522:"Urgency",524:{name:"Subject Reference",repeatable:1,description:function(e){var t=c(e).split(":");return t[2]+(t[3]?"/"+t[3]:"")+(t[4]?"/"+t[4]:"")}},527:"Category",532:{name:"Supplemental Category",repeatable:1},534:"Fixture Identifier",537:{name:"Keywords",repeatable:1},538:{name:"Content Location Code",repeatable:1},539:{name:"Content Location Name",repeatable:1},542:"Release Date",547:"Release Time",549:"Expiration Date",550:"Expiration Time",552:"Special Instructions",554:{name:"Action Advised",description:function(e){var t=c(e);return"01"===t?"Object Kill":"02"===t?"Object Replace":"03"===t?"Object Append":"04"===t?"Object Reference":"Unknown"}},557:{name:"Reference Service",repeatable:1},559:{name:"Reference Date",repeatable:1},562:{name:"Reference Number",repeatable:1},567:{name:"Date Created",description:Ki},572:{name:"Time Created",description:Ji},574:{name:"Digital Creation Date",description:Ki},575:{name:"Digital Creation Time",description:Ji},577:"Originating Program",582:"Program Version",587:{name:"Object Cycle",description:function(e){var t=c(e);return"a"===t?"morning":"p"===t?"evening":"b"===t?"both":"Unknown"}},592:{name:"By-line",repeatable:1},597:{name:"By-line Title",repeatable:1},602:"City",604:"Sub-location",607:"Province/State",612:"Country/Primary Location Code",613:"Country/Primary Location Name",615:"Original Transmission Reference",617:"Headline",622:"Credit",627:"Source",628:"Copyright Notice",630:{name:"Contact",repeatable:1},632:"Caption/Abstract",634:{name:"Writer/Editor",repeatable:1},637:{name:"Rasterized Caption",description:function(e){return e}},642:"Image Type",643:{name:"Image Orientation",description:function(e){var t=c(e);return"P"===t?"Portrait":"L"===t?"Landscape":"S"===t?"Square":"Unknown"}},647:"Language Identifier",662:{name:"Audio Type",description:function(e){var t=c(e),n=t.charAt(0),r=t.charAt(1),i="";return"1"===n?i+="Mono":"2"===n&&(i+="Stereo"),"A"===r?i+=", actuality":"C"===r?i+=", question and answer session":"M"===r?i+=", music, transmitted by itself":"Q"===r?i+=", response to a question":"R"===r?i+=", raw sound":"S"===r?i+=", scener":"V"===r?i+=", voicer":"W"===r&&(i+=", wrap"),""!==i?i:t}},663:{name:"Audio Sampling Rate",description:function(e){return parseInt(c(e),10)+" Hz"}},664:{name:"Audio Sampling Resolution",description:function(e){var t=parseInt(c(e),10);return t+(1===t?" bit":" bits")}},665:{name:"Audio Duration",description:function(e){var t=c(e);return t.length>=6?t.substr(0,2)+":"+t.substr(2,2)+":"+t.substr(4,2):t}},666:"Audio Outcue",698:"Short Document ID",699:"Unique Document ID",700:"Owner ID",712:{name:function(e){return 2===e.length?"ObjectData Preview File Format":"Record 2 destination"},description:function(e){if(2===e.length){var t=Yi(e);return 0===t?"No ObjectData":1===t?"IPTC-NAA Digital Newsphoto Parameter Record":2===t?"IPTC7901 Recommended Message Format":3===t?"Tagged Image File Format (Adobe/Aldus Image data)":4===t?"Illustrator (Adobe Graphics data)":5===t?"AppleSingle (Apple Computer Inc)":6===t?"NAA 89-3 (ANPA 1312)":7===t?"MacBinary II":8===t?"IPTC Unstructured Character Oriented File Format (UCOFF)":9===t?"United Press International ANPA 1312 variant":10===t?"United Press International Down-Load Message":11===t?"JPEG File Interchange (JFIF)":12===t?"Photo-CD Image-Pac (Eastman Kodak)":13===t?"Microsoft Bit Mapped Graphics File [*.BMP]":14===t?"Digital Audio File [*.WAV] (Microsoft & Creative Labs)":15===t?"Audio plus Moving Video [*.AVI] (Microsoft)":16===t?"PC DOS/Windows Executable Files [*.COM][*.EXE]":17===t?"Compressed Binary File [*.ZIP] (PKWare Inc)":18===t?"Audio Interchange File Format AIFF (Apple Computer Inc)":19===t?"RIFF Wave (Microsoft Corporation)":20===t?"Freehand (Macromedia/Aldus)":21===t?'Hypertext Markup Language "HTML" (The Internet Society)':22===t?"MPEG 2 Audio Layer 2 (Musicom), ISO/IEC":23===t?"MPEG 2 Audio Layer 3, ISO/IEC":24===t?"Portable Document File (*.PDF) Adobe":25===t?"News Industry Text Format (NITF)":26===t?"Tape Archive (*.TAR)":27===t?"Tidningarnas Telegrambyrå NITF version (TTNITF DTD)":28===t?"Ritzaus Bureau NITF version (RBNITF DTD)":29===t?"Corel Draw [*.CDR]":"Unknown format ".concat(t)}return c(e)}},713:{name:"ObjectData Preview File Format Version",description:function(e,t){var n={0:{0:"1"},1:{1:"1",2:"2",3:"3",4:"4"},2:{4:"4"},3:{1:"5.0",2:"6.0"},4:{1:"1.40"},5:{1:"2"},6:{1:"1"},11:{1:"1.02"},20:{1:"3.1",2:"4.0",3:"5.0",4:"5.5"},21:{2:"2.0"}},r=Yi(e);if(t["ObjectData Preview File Format"]){var i=Yi(t["ObjectData Preview File Format"].value);if(Object.prototype.hasOwnProperty.call(n,i)&&Object.prototype.hasOwnProperty.call(n[i],r))return n[i][r]}var o=$i(e);return null===o?c(e):o+""}},714:"ObjectData Preview Data",1802:{name:"Size Mode",description:function(e){return e[0].toString()}},1812:{name:"Max Subfile Size",description:function(e){for(var t=0,n=0;n<e.length;n++)t=(t<<8)+e[n];return t.toString()}},1882:{name:"ObjectData Size Announced",description:function(e){for(var t=0,n=0;n<e.length;n++)t=(t<<8)+e[n];return t.toString()}},1887:{name:"Maximum ObjectData Size",description:function(e){for(var t=0,n=0;n<e.length;n++)t=(t<<8)+e[n];return t.toString()}}}};function Ki(e){var t=c(e);return t.length>=8?t.substr(0,4)+"-"+t.substr(4,2)+"-"+t.substr(6,2):t}function Ji(e){var t=c(e),n=t;return t.length>=6&&(n=t.substr(0,2)+":"+t.substr(2,2)+":"+t.substr(4,2),11===t.length&&(n+=t.substr(6,1)+t.substr(7,2)+":"+t.substr(9,2))),n}function qi(e){var t=c(e);return"%G"===t?"UTF-8":"%5"===t?"Windows-1252":"%/G"===t?"UTF-8 Level 1":"%/H"===t?"UTF-8 Level 2":"%/I"===t?"UTF-8 Level 3":"/A"===t?"ISO-8859-1":"/B"===t?"ISO-8859-2":"/C"===t?"ISO-8859-3":"/D"===t?"ISO-8859-4":"/@"===t?"ISO-8859-5":"/G"===t?"ISO-8859-6":"/F"===t?"ISO-8859-7":"/H"===t?"ISO-8859-8":"Unknown"}function Yi(e){var t=$i(e);return null===t?parseInt(c(e),10):t}function $i(e){return 2!==e.length||Zi(e[0])&&Zi(e[1])?null:(e[0]<<8)+e[1]}function Zi(e){return e>=48&&e<=57}var Qi=function(){if("undefined"!=typeof TextDecoder)return TextDecoder},eo={128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376},to=function(e,t){if("string"==typeof t)return h(t);var n=Qi();if("undefined"!=typeof n&&void 0!==e)try{return new n(e).decode(t instanceof DataView?t.buffer:Uint8Array.from(t))}catch(e){}var r=m(l(t));return void 0!==r?r:function(e){for(var t=e instanceof DataView,n=t?e.byteLength:e.length,r=t?function(t){return e.getUint8(t)}:function(t){return e[t]},i=Array(n),o=0;o<n;o++){var a=r(o),u=eo[a];i[o]=void 0!==u?u:a}return l(i)}(t)},no={read:function(e,t,n){var r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:_r,i=arguments.length>4?arguments[4]:void 0;try{if(Array.isArray(e)){var o=new DataView(Uint8Array.from(e).buffer);return ao(o,{size:e.length},0,n,r,i||ri(o))}var a=function(e,t){for(;t+12<=e.byteLength;){var n=ro(e,t);if(io(n))return{naaBlock:n,dataOffset:t+n.headerSize};t+=n.headerSize+n.size+oo(n)}throw Error("No IPTC NAA resource block.")}(e,t);return ao(e,a.naaBlock,a.dataOffset,n,r,i||ri(e))}catch(e){return{}}}};function ro(e,t){if(943868237!==e.getUint32(t,0))throw Error("Not an IPTC resource block.");var n=e.getUint8(t+4+2),r=(n%2==0?n+1:n)+1;return{headerSize:6+r+4,type:e.getUint16(t+4),size:e.getUint32(t+4+2+r)}}function io(e){return 1028===e.type}function oo(e){return e.size%2!=0?1:0}function ao(e,t,n,r,i,o){for(var a={},u=void 0,f=n+t.size;n<f&&n<e.byteLength;){var s=uo(e,n,a,u,r,i,o),c=s.tag,l=s.tagSize;if(null===c)break;c&&("encoding"in c&&(u=c.encoding),void 0===a[c.name]||void 0===c.repeatable?a[c.name]={id:c.id,value:c.value,description:c.description}:(a[c.name]instanceof Array||(a[c.name]=[{id:a[c.name].id,value:a[c.name].value,description:a[c.name].description}]),a[c.name].push({id:c.id,value:c.value,description:c.description}))),n+=5+l}return a}function uo(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{},r=arguments.length>3&&void 0!==arguments[3]?arguments[3]:void 0,i=arguments.length>4&&void 0!==arguments[4]?arguments[4]:0,o=arguments.length>5&&void 0!==arguments[5]?arguments[5]:_r,a=arguments.length>6?arguments[6]:void 0;if(function(e,t){return 28!==e.getUint8(t)}(e,t)||function(e,t){return t+5>e.byteLength}(e,t))return{tag:null,tagSize:0};var u=e.getUint16(t+1),f=e.getUint16(t+3);if(function(e,t,n){return t+5+n>e.byteLength}(e,t,f)||!function(e,t){var n=Math.ceil((5+t)/Yr);return e.iptcDatasetsRemaining>=n?(e.iptcDatasetsRemaining-=n,1):0}(a,f))return{tag:null,tagSize:0};if(!i&&!Wi.iptc[u])return{tag:void 0,tagSize:f};if(!o.shouldParseTag("iptc",function(e,t){var n=Wi.iptc[e];return n?"string"==typeof n?n:n&&"string"==typeof n.name?n.name:void 0:t?"undefined-".concat(e):void 0}(u,i),u))return{tag:void 0,tagSize:f};var s=function(e,t,n){for(var r=[],i=0;i<n;i++)r.push(e.getUint8(t+i));return r}(e,t+5,f),c={id:u,name:fo(Wi.iptc[u],u,s),value:s,description:so(Wi.iptc[u],s,n,r)};return function(e){return Wi.iptc[e]&&Wi.iptc[e].repeatable}(u)&&(c.repeatable=1),function(e){return Wi.iptc[e]&&void 0!==Wi.iptc[e].encoding_name}(u)&&(c.encoding=Wi.iptc[u].encoding_name(s)),{tag:c,tagSize:f}}function fo(e,t,n){return e?function(e){return"string"==typeof e}(e)?e:function(e){return"function"==typeof e.name}(e)?e.name(n):e.name:"undefined-".concat(t)}function so(e,t,n,r){if(function(e){return e&&void 0!==e.description}(e))try{return e.description(t,n)}catch(e){}return function(e,t){return e&&t instanceof Array}(e,t)?to(r,t):t}function co(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var lo={"tiff:Orientation":function(e){return"1"===e?"Horizontal (normal)":"2"===e?"Mirror horizontal":"3"===e?"Rotate 180":"4"===e?"Mirror vertical":"5"===e?"Mirror horizontal and rotate 270 CW":"6"===e?"Rotate 90 CW":"7"===e?"Mirror horizontal and rotate 90 CW":"8"===e?"Rotate 270 CW":e},"tiff:ResolutionUnit":function(e){return er.ResolutionUnit(parseInt(e,10))},"tiff:XResolution":function(e){return po(er.XResolution,e)},"tiff:YResolution":function(e){return po(er.YResolution,e)},"exif:ApertureValue":function(e){return po(er.ApertureValue,e)},"exif:GPSLatitude":ho,"exif:GPSLongitude":ho,"exif:FNumber":function(e){return po(er.FNumber,e)},"exif:FocalLength":function(e){return po(er.FocalLength,e)},"exif:FocalPlaneResolutionUnit":function(e){return er.FocalPlaneResolutionUnit(parseInt(e,10))},"exif:ColorSpace":function(e){return er.ColorSpace(function(e){return"0x"===e.substring(0,2)?parseInt(e.substring(2),16):parseInt(e,10)}(e))},"exif:ComponentsConfiguration":function(e,t){if(/^\d, \d, \d, \d$/.test(t)){var n=t.split(", ").map(function(e){return parseInt(e,10)});return er.ComponentsConfiguration(n)}return t},"exif:Contrast":function(e){return er.Contrast(parseInt(e,10))},"exif:CustomRendered":function(e){return er.CustomRendered(parseInt(e,10))},"exif:ExposureMode":function(e){return er.ExposureMode(parseInt(e,10))},"exif:ExposureProgram":function(e){return er.ExposureProgram(parseInt(e,10))},"exif:ExposureTime":function(e){return go(e)?er.ExposureTime(e.split("/").map(function(e){return parseInt(e,10)})):e},"exif:MeteringMode":function(e){return er.MeteringMode(parseInt(e,10))},"exif:Saturation":function(e){return er.Saturation(parseInt(e,10))},"exif:SceneCaptureType":function(e){return er.SceneCaptureType(parseInt(e,10))},"exif:Sharpness":function(e){return er.Sharpness(parseInt(e,10))},"exif:ShutterSpeedValue":function(e){return po(er.ShutterSpeedValue,e)},"exif:WhiteBalance":function(e){return er.WhiteBalance(parseInt(e,10))}};function po(e,t){return go(t)?e(t.split("/")):t}function go(e){return/^-?\d+\/-?\d+$/.test(e)}function ho(e){var t,n=function(e){if(Array.isArray(e))return e}(t=e.split(","))||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(t)||function(e){if(e){if("string"==typeof e)return co(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?co(e,2):void 0}}(t)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),r=n[0],i=n[1];if(void 0!==r&&void 0!==i){var o=parseFloat(r),a=parseFloat(i),u=i.charAt(i.length-1);if(!Number.isNaN(o)&&!Number.isNaN(a))return""+(o+a/60)+u}return e}function mo(e,t,n){return e.slice(n,n+t.length)===t}function vo(e,t,n){var r=e.indexOf(n,t);return-1===r?e.length:r+n.length}function yo(e,t,n){return e>t&&e<n}var bo={xmp:"http://ns.adobe.com/xap/1.0/",tiff:"http://ns.adobe.com/tiff/1.0/",exif:"http://ns.adobe.com/exif/1.0/",dc:"http://purl.org/dc/elements/1.1/",xmpMM:"http://ns.adobe.com/xap/1.0/mm/",stEvt:"http://ns.adobe.com/xap/1.0/sType/ResourceEvent#",stRef:"http://ns.adobe.com/xap/1.0/sType/ResourceRef#",photoshop:"http://ns.adobe.com/photoshop/1.0/"};function So(e){return Object.prototype.hasOwnProperty.call(bo,e)?bo[e]:"http://fallback.namespace/"+e}function xo(e,t){for(var n=t;n<e.length;n++){var r=e.charAt(n);if('"'===r||"'"===r){if(-1===(n=e.indexOf(r,n+1)))return e.length}else if(">"===r||"["===r)return n+1}return e.length}function Io(e,t,n){var r=Ao(e,t,n);if(r===t)return 0;for(;;){var i=Po(e,r,n);if(mo(e,"/>",i))return 1;if(i===r)return 0;if(-1===(r=To(e,i,n)))return 0}}function Ao(e,t,n){for(var r=t;r<n&&-1===" \t\r\n/><=\"'".indexOf(e.charAt(r));)r++;return r}function Po(e,t,n){for(var r=t;r<n&&-1!==" \t\r\n".indexOf(e.charAt(r));)r++;return r}function To(e,t,n){var r=Ao(e,t,n);if(r===t)return-1;var i=Po(e,r,n);if("="!==e.charAt(i))return-1;var o=Po(e,i+1,n),a=e.charAt(o);if('"'!==a&&"'"!==a)return-1;for(var u=o+1;u<n;u++)if(e.charAt(u)===a)return u+1;return-1}function Eo(e,t,n){for(var r=0,i=0,o=t;o<n;o++){var a=e.charAt(o);if("="===a){if(1!==r&&2!==r)return i;r=3}else if('"'===a||"'"===a){if(3===r||1===r){var u=e.indexOf(a,o+1);if(-1===u||u>=n)return i;o=u}else if(4!==r)return i;i++,r=5}else if("/"===a){if(3===r)return i;0!==r&&5!==r&&6!==r||(r=7)}else{if(">"===a)return Co(r)?i+1:i;if(Uo(a))4===r&&i++,0===r||4===r||5===r?r=6:1===r&&(r=2);else{if(7===r)return i;2===r&&i++,2===r||5===r||6===r?r=1:3===r&&(r=4)}}}return Co(r)?i+1:i}function Co(e){return 1===e||2===e||4===e}function Uo(e){return e<=" "||""===e||""===e||"\u2028"===e||"\u2029"===e}function Oo(e){return Oo="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},Oo(e)}function wo(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function Mo(e){var t="function"==typeof Map?new Map:void 0;return Mo=function(e){if(null===e||!function(e){try{return-1!==Function.toString.call(e).indexOf("[native code]")}catch(t){return"function"==typeof e}}(e))return e;if("function"!=typeof e)throw new TypeError("Super expression must either be null or a function");if(void 0!==t){if(t.has(e))return t.get(e);t.set(e,n)}function n(){return function(e,t,n){if(Lo())return Reflect.construct.apply(null,arguments);var r=[null];r.push.apply(r,t);var i=new(e.bind.apply(e,r));return n&&Fo(i,n.prototype),i}(e,arguments,Ro(this).constructor)}return n.prototype=Object.create(e.prototype,{constructor:{value:n,enumerable:0,writable:1,configurable:1}}),Fo(n,e)},Mo(e)}function Lo(){try{var e=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch(e){}return(Lo=function(){return!!e})()}function Fo(e,t){return Fo=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(e,t){return e.__proto__=t,e},Fo(e,t)}function Ro(e){return Ro=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},Ro(e)}var Do={read:function(e,t,n){var r={};if("string"==typeof e)return qo(r,e,n),r;var i,o=(i=function(e,t){if(0===t.length)return[];var n=[Jo(e,t.slice(0,1))];return t.length>1&&n.push(Jo(e,t.slice(1))),n}(e,t),function(e){if(Array.isArray(e))return e}(i)||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(i)||function(e){if(e){if("string"==typeof e)return wo(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?wo(e,2):void 0}}(i)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()),a=o[0],u=o[1],f=qo(r,a,n);if(u){var s=qo(r,u,n);f||s||(delete r._raw,qo(r,Jo(e,t),n))}return r}},No=1,Go=3,ko=4,_o=7,Bo=8,jo='<?xpacket end="',zo='"?>',Vo=16,Xo=256,Ho=25e4,Wo=0,Ko=function(e){function t(e){var n;return function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,t),(n=function(e,t,n){return t=Ro(t),function(e,t){if(t&&("object"==Oo(t)||"function"==typeof t))return t;if(void 0!==t)throw new TypeError("Derived constructors may only return object or undefined");return function(e){if(void 0===e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}(e)}(e,Lo()?Reflect.construct(t,n||[],Ro(e).constructor):t.apply(e,n))}(this,t,[e])).name="ParseError",n}return function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function");e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,writable:1,configurable:1}}),Object.defineProperty(e,"prototype",{writable:0}),t&&Fo(e,t)}(t,e),Object.defineProperty(n=t,"prototype",{writable:0}),n;var n}(Mo(Error));function Jo(e,t){for(var n=t.map(function(t){return function(e,t){var n=e.byteLength,r=e.byteOffset||0,i=Math.min(Math.max(t.dataOffset,0),n),o=Math.min(i+Math.max(t.length,0),n);return new Uint8Array(e.buffer.slice(r+i,r+o))}(e,t)}),r=n.reduce(function(e,t){return e+t.length},0),i=new Uint8Array(r),o=0,a=0;a<n.length;a++)i.set(n[a],o),o+=n[a].length;return new DataView(i.buffer)}function qo(e,t,n){try{var r=function(e,t){var n=function(e){if(e)return e;if("undefined"!=typeof DOMParser)return new DOMParser;try{var t=j.optionalPackage("@xmldom/xmldom");return new(0,t.DOMParser)({onError:t.onErrorStopParsing})}catch(e){return}}(t);if(!n)throw console.warn("Warning: DOMParser is not available. It is needed to be able to parse XMP tags."),Error();var r=function(e){if("string"==typeof e)return Yo(e);var t=Qi();if(void 0!==t)try{return{xmlString:new t("utf-8",{fatal:1}).decode(e),decodeValue:$o}}catch(e){}return Yo(l(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)))}(e),i=r.xmlString,o=r.decodeValue;return{doc:Zo(n,function(e){var t=Math.max(e.lastIndexOf("\n"),e.lastIndexOf("\r"),e.lastIndexOf("\u2028"),e.lastIndexOf("\u2029"))+1,n=e.indexOf(jo,t);if(-1===n)return e;var r=e.lastIndexOf(zo,e.length-zo.length-1);return r<n+jo.length?e:e.slice(0,r+zo.length)}(i.replace(/^.+(<\?xpacket begin)/,"$1"))),raw:i,decodeValue:o}}(t,n),i=r.doc,o=r.raw,a=r.decodeValue;e._raw=(e._raw||"")+o;var u=Qo(i),f={};ia(ea(u,1,a),f,Object.create(null)),delete f._raw;for(var s=Object.keys(f),c=0;c<s.length;c++)x(e,s[c],f[s[c]]);return 1}catch(e){return 0}}function Yo(e){var t=m(e);return void 0!==t?{xmlString:t,decodeValue:$o}:{xmlString:e,decodeValue:h}}function $o(e){return e}function Zo(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:0;if(function(e,t){for(var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:1/0,r=0,i=0,o=e.indexOf("<");-1!==o;){if(mo(e,"\x3c!--",o))i++,o=vo(e,o+4,"--\x3e");else if(mo(e,"<![CDATA[",o))i++,o=vo(e,o+9,"]]>");else if(mo(e,"<?",o))i++,o=vo(e,o+2,"?>");else if(mo(e,"<!",o))i++,o=xo(e,o+2);else if(mo(e,"</",o))r=Math.max(r-1,0),o=vo(e,o+2,">");else{if(r+1>t)return 1;var a=e.indexOf("<",o+1),u=-1===a?e.length:a;Io(e,o+1,u)||r++,i+=1+Eo(e,o+1,u),o++}if(i>n)return 1;o=e.indexOf("<",o)}return 0}(t,Xo,Ho))throw new Ko("XMP elements nested deeper than ".concat(Xo," levels or more than ").concat(Ho," markup nodes."));try{var r=e.parseFromString(t,"application/xml"),i=r.getElementsByTagName("parsererror");if(i.length>0)throw new Ko(i[0].textContent);return r}catch(r){if("ParseError"===r.name&&function(e){for(var t=e.message+"",n=["prefix is non-null and namespace is null","prefix not bound to a namespace","prefix inte bundet till en namnrymd"],r=0;r<n.length;r++)if(-1!==t.indexOf(n[r]))return 1;return function(e){for(var t=e.split(/[\n\r\u2028\u2029]/),n=0;n<t.length;n++){var r=t[n].indexOf("Namespace prefix ");if(-1!==r&&t[n].lastIndexOf(" is not defined")>r+17)return 1}return 0}(t)}(r)&&!n)return Zo(e,function(e){var t=function(e){for(var t=0;t<e.length;){if(-1===(t=e.indexOf("<",t)))return-1;if(/[A-Za-z_]/.test(e.charAt(t+1)))return t;mo(e,"\x3c!--",t)?t=vo(e,t+4,"--\x3e"):mo(e,"<![CDATA[",t)?t=vo(e,t+9,"]]>"):"?"===e.charAt(t+1)?t=vo(e,t+2,"?>"):t++}return-1}(e);if(-1===t)return e;var n=function(e,t){for(var n,r,i=[],o=t;o<e.length;o++){var a=e.charAt(o);if(void 0!==n)a===n&&(i.push({start:r,end:o}),n=void 0);else if('"'===a||"'"===a)n=a,r=o+1;else if(">"===a)return"/"===e.charAt(o-1)?{insertionIndex:o-1,attributeValueSpans:i}:{insertionIndex:o,attributeValueSpans:i}}return{insertionIndex:-1,attributeValueSpans:i}}(e,t+1),r=n.insertionIndex,i=n.attributeValueSpans;if(-1===r)return e;var o=function(e,t,n,r){for(var i,o=Object.create(null),a=/xmlns:([A-Za-z_][A-Za-z0-9._-]*)\s*=\s*["']([^"']*)["']/g,u=0;null!==(i=a.exec(e));){for(;u<r.length&&r[u].end<=i.index;)u++;u<r.length&&r[u].start<=i.index?a.lastIndex=r[u].end:(""!==i[2]||yo(i.index,t,n))&&(o[i[1]]=1)}return o}(e,t,r,i),a=function(e){for(var t,n=[],r=Object.create(null),i=/(?:^|[^A-Za-z0-9._-])([A-Za-z_][A-Za-z0-9._-]*):[A-Za-z_][A-Za-z0-9._-]*/g;null!==(t=i.exec(e));){var o=t[1];"xmlns"!==o&&"xml"!==o&&void 0===r[o]&&(r[o]=1,n.push(o))}return n}(e).filter(function(e){return void 0===o[e]});if(0===a.length)return e;var u=function(e){for(var t=[],n=0;n<e.length;n++){var r=e[n];t.push(" xmlns:"+r+'="'+So(r)+'"')}return t.join("")}(a);return e.slice(0,r)+u+e.slice(r)}(t),1);throw r}}function Qo(e){for(var t=e.childNodes,n=0;n<t.length;n++){if("x:xmpmeta"===t[n].tagName)return Qo(t[n]);if("rdf:RDF"===t[n].tagName)return t[n]}throw Error()}function ea(e,t,n){var r,i=function(e){for(var t=e.childNodes,n=[],r=0;r<t.length;r++)ta(t[r])||n.push(t[r]);return n}(e);return(r=i).length>0&&r.every(na)?t?{}:n(function(e){return e.map(function(e){return e.nodeValue}).join("")}(i)):function(e,t){var n=Object.create(null);return e.forEach(function(e){if(function(e){return e.nodeType===No}(e)){var r=function(e,t){return{attributes:ra(e,t),value:ea(e,0,t)}}(e,t);void 0!==n[e.nodeName]?(Array.isArray(n[e.nodeName])||(n[e.nodeName]=[n[e.nodeName]]),n[e.nodeName].push(r)):n[e.nodeName]=r}}),n}(i,n)}function ta(e){return e.nodeType===Bo||e.nodeType===_o}function na(e){return e.nodeType===Go||e.nodeType===ko}function ra(e,t){for(var n=e.attributes,r=Object.create(null),i=0;i<n.length;i++)x(r,n[i].nodeName,t(n[i].value));return r}function ia(e,t,n){for(var r in e){var i=e[r];Array.isArray(i)||(i=[i]),i.forEach(function(e){oa(e.attributes,t,n),"object"===Oo(e.value)&&da(e.value,t,n)})}}function oa(e,t,n){for(var r in e)try{aa(r)&&fa(t,n,sa(r),ca(e[r],e[r],{},r))}catch(e){}}function aa(e){return"rdf:parseType"!==e&&!ua(e)}function ua(e){return"xmlns"===e.split(":")[0]}function fa(e,t,n,r){var i=I(n);x(e,i,r.tag),x(t,i,r.plainDescription)}function sa(e){return/^MicrosoftPhoto(_\d+_)?:Rating$/i.test(e)?"RatingPercent":e.split(":")[1]||e}function ca(e,t,n,r){return{tag:{value:e,attributes:n,description:la(e,t,r)},plainDescription:t}}function la(e,t,n){if(!function(e){return Object.prototype.hasOwnProperty.call(lo,e)&&"function"==typeof lo[e]}(n)||function(e){return"object"===Oo(e)&&!Array.isArray(e)}(e))return t;if(Array.isArray(e)){try{var r=lo[n](e,t);if("string"==typeof r)return r}catch(e){}return t}try{return lo[n](e)}catch(t){return e}}function da(e,t,n){pa(function(){for(var r in e)try{ua(r)||fa(t,n,sa(r),ga(e[r],r))}catch(e){}})}function pa(e){Wo++;try{if(Wo>Vo)throw new Ko("XMP value nested deeper than ".concat(Vo," levels."));return e()}finally{Wo--}}function ga(e,t){return ha(e)?function(e,t){return Ma(e[e.length-1],t)}(e,t):function(e){return"Resource"===e.attributes["rdf:parseType"]&&"string"==typeof e.value&&""===e.value.trim()}(e)?{tag:{value:"",attributes:{},description:""},plainDescription:""}:ma(e)?va(e,t):Ia(e)?Aa(e,t):Pa(e)?Ta(e,t):Ea(e)?function(e,t){var n=ya(e),r=Ua(e);return ca(r.value,r.plainDescription,n,t)}(e,t):Ma(e,t)}function ha(e){return Array.isArray(e)}function ma(e){return"Resource"===e.attributes["rdf:parseType"]&&void 0!==e.value["rdf:value"]||void 0!==e.value["rdf:Description"]&&void 0!==e.value["rdf:Description"].value["rdf:value"]}function va(e,t){var n=ya(e);void 0!==e.value["rdf:Description"]&&(e=e.value["rdf:Description"]),S(n,ya(e),function(e){var t={};if("object"!==Oo(e.value))return t;for(var n in e.value)"rdf:value"===n||ua(n)||x(t,I(sa(n)),e.value[n].value);return t}(e));var r=function(e){var t=ba(e.value["rdf:value"]),n=La(t);return n?{value:n,plainDescription:n}:function(e){if(Ea(e))return pa(function(){return Ua(e)});if("object"===Oo(e.value)){var t=Object.create(null),n=Object.create(null);return da(e.value,t,n),{value:t,plainDescription:Sa(t,n)}}return{value:e.value,plainDescription:e.value}}(t)}(e);return ca(r.value,r.plainDescription,n,t)}function ya(e){var t={};for(var n in e.attributes)"rdf:parseType"===n||"rdf:resource"===n||ua(n)||x(t,I(sa(n)),e.attributes[n]);return t}function ba(e){return ha(e)?e[e.length-1]:e}function Sa(e,t){var n=[];for(var r in e)n.push("".concat(xa(r),": ").concat(t[r]));return n.join("; ")}function xa(e){return"CiAdrCity"===e?"CreatorCity":"CiAdrCtry"===e?"CreatorCountry":"CiAdrExtadr"===e?"CreatorAddress":"CiAdrPcode"===e?"CreatorPostalCode":"CiAdrRegion"===e?"CreatorRegion":"CiEmailWork"===e?"CreatorWorkEmail":"CiTelWork"===e?"CreatorWorkPhone":"CiUrlWork"===e?"CreatorWorkUrl":e}function Ia(e){return"Resource"===e.attributes["rdf:parseType"]||void 0!==e.value["rdf:Description"]&&void 0===e.value["rdf:Description"].value["rdf:value"]}function Aa(e,t){var n={},r=Object.create(null),i={};return void 0!==e.value["rdf:Description"]&&(oa(e.value["rdf:Description"].attributes,n,r),S(i,ya(e)),e=e.value["rdf:Description"]),"object"===Oo(e.value)&&da(e.value,n,r),ca(n,Sa(n,r),i,t)}function Pa(e){return("string"==typeof(t=e.value)?""===t:0===Object.keys(t).length)&&void 0===e.attributes["xml:lang"]&&void 0===e.attributes["rdf:resource"];var t}function Ta(e,t){var n={},r=Object.create(null);return oa(e.attributes,n,r),ca(n,Sa(n,r),{},t)}function Ea(e){return void 0!==Ca(e.value)}function Ca(e){return ba(e["rdf:Bag"]||e["rdf:Seq"]||e["rdf:Alt"])}function Ua(e){var t=Ca(e.value).value["rdf:li"],n=[],r=[];return void 0===t?t=[]:Array.isArray(t)||(t=[t]),t.forEach(function(e){var t=function(e){return ma(e)?Oa(va(e)):Ia(e)?wa(Aa(e)):Pa(e)?wa(Ta(e)):Oa(Ma(e))}(e);n.push(t.value),r.push(t.plainDescription)}),{value:n,plainDescription:r.join(", ")}}function Oa(e){return{value:e.tag,plainDescription:e.plainDescription}}function wa(e){return{value:e.tag.value,plainDescription:e.plainDescription}}function Ma(e,t){var n=function(e){var t=La(e);if(t)return{value:t,plainDescription:t};if("string"==typeof e.value)return{value:e.value,plainDescription:e.value};var n={},r=Object.create(null);return ia(e.value,n,r),{value:n,plainDescription:Sa(n,r)}}(e);return ca(n.value,n.plainDescription,ya(e),t)}function La(e){return e.attributes&&e.attributes["rdf:resource"]}function Fa(e){return Fa="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},Fa(e)}function Ra(e,t,n){return(t=function(e){var t=function(e){if("object"!=Fa(e)||!e)return e;var t=e[Symbol.toPrimitive];if(void 0!==t){var n=t.call(e,"string");if("object"!=Fa(n))return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return e+""}(e);return"symbol"==Fa(t)?t:t+""}(t))in e?Object.defineProperty(e,t,{value:n,enumerable:1,configurable:1,writable:1}):e[t]=n,e}function Da(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var Na={2e3:{name:"PathInformation",description:function(e){for(var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{remaining:32768},n={},r=[],i=0;i<e.byteLength&&t.remaining>0;i+=26){var o=Tr.getShortAt(e,i);Ga[o]&&(n[o]||(n[o]=Ga[o].description),r.push({type:o,path:Ga[o].path(e,i+2)}),t.remaining--)}return JSON.stringify({types:n,paths:r})}},2999:{name:"ClippingPathName",description:function(e){return(t=f(e,0),function(e){if(Array.isArray(e))return e}(t)||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(t)||function(e){if(e){if("string"==typeof e)return Da(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?Da(e,2):void 0}}(t)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}())[1];var t}}},Ga=Ra(Ra(Ra(Ra(Ra(Ra(Ra(Ra(Ra({},0,{description:"Closed subpath length",path:function(e,t){return[Tr.getShortAt(e,t)]}}),1,{description:"Closed subpath Bezier knot, linked",path:ka}),2,{description:"Closed subpath Bezier knot, unlinked",path:ka}),3,{description:"Open subpath length",path:function(e,t){return[Tr.getShortAt(e,t)]}}),4,{description:"Open subpath Bezier knot, linked",path:ka}),5,{description:"Open subpath Bezier knot, unlinked",path:ka}),6,{description:"Path fill rule",path:function(){return[]}}),8,{description:"Initial fill rule",path:function(e,t){return[Tr.getShortAt(e,t)]}}),7,{description:"Clipboard",path:function(e,t){return[[Ba(e,t,8),Ba(e,t+4,8),Ba(e,t+8,8),Ba(e,t+12,8)],Ba(e,t+16,8)]}});function ka(e,t){for(var n=[],r=0;r<24;r+=8)n.push(_a(e,t+r));return n}function _a(e,t){var n=Ba(e,t,8);return[Ba(e,t+4,8),n]}function Ba(e,t,n){var r,i=Tr.getLongAt(e,t),o=i>>>31==0?1:-1,a=(2130706432&i)>>>32-n,u=i&parseInt(w("1",32-n),2);return o*(r=a.toString(2)+"."+O(u.toString(2),32-n,"0"),parseInt(r.replace(".",""),2)/Math.pow(2,(r.split(".")[1]||"").length))}function ja(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var za={read:function(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:_r;if(!Array.isArray(e))return{};for(var r=new Uint8Array(e),i=o(r.buffer),u={remaining:32768},f={},s=0,c=0;c<Ja&&s+Ka<=i.byteLength;c++){var d=a(i,s,Wa);s+=Wa;var p=Tr.getShortAt(i,s),g=Ya(i,s+=Xa),h=g.tagName;if((s+=g.tagNameSize)+Ha>i.byteLength)break;var m=Tr.getLongAt(i,s);s+=Ha;var v=Math.min(m,i.byteLength-s);if(d===Va){var y=qa(p,h);if(!n.shouldParseTag("photoshop",y,p)){s+=v+v%2;continue}var b=o(i.buffer,s,v),S={id:p,value:l(r,s,s+v)};if(Na[p]){try{S.description=Na[p].description(b,u)}catch(e){S.description="<no description formatter>"}x(f,y,S)}else t&&(f[y]=S)}s+=v+v%2}return f}},Va="8BIM",Xa=2,Ha=4,Wa=Va.length,Ka=Wa+Xa+2+Ha,Ja=4096;function qa(e,t){return Na[e]?I(t||Na[e].name):"undefined-".concat(e)}function Ya(e,t){var n,r=function(e){if(Array.isArray(e))return e}(n=f(e,t))||function(e){var t=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=t){var n,r,i,o,a=[],u=1,f=0;try{for(i=(t=t.call(e)).next,!2;!(u=(n=i.call(t)).done)&&(a.push(n.value),2!==a.length);u=1);}catch(e){f=1,r=e}finally{try{if(!u&&null!=t.return&&(o=t.return(),Object(o)!==o))return}finally{if(f)throw r}}return a}}(n)||function(e){if(e){if("string"==typeof e)return ja(e,2);var t={}.toString.call(e).slice(8,-1);return"Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t?Array.from(e):"Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)?ja(e,2):void 0}}(n)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),i=r[0];return{tagName:r[1],tagNameSize:1+i+(i%2==0?1:0)}}var $a={desc:{name:"ICC Description"},cprt:{name:"ICC Copyright"},dmdd:{name:"ICC Device Model Description"},vued:{name:"ICC Viewing Conditions Description"},dmnd:{name:"ICC Device Manufacturer for Display"},tech:{name:"Technology"}},Za={4:{name:"Preferred CMM type",value:function(e,t){return a(e,t,4)},description:function(e){return null!==e?eu(e):""}},8:{name:"Profile Version",value:function(e,t){return e.getUint8(t).toString(10)+"."+(e.getUint8(t+1)>>4).toString(10)+"."+(e.getUint8(t+1)%16).toString(10)}},12:{name:"Profile/Device class",value:function(e,t){return a(e,t,4)},description:function(e){switch(e.toLowerCase()){case"scnr":return"Input Device profile";case"mntr":return"Display Device profile";case"prtr":return"Output Device profile";case"link":return"DeviceLink profile";case"abst":return"Abstract profile";case"spac":return"ColorSpace profile";case"nmcl":return"NamedColor profile";case"cenc":return"ColorEncodingSpace profile";case"mid ":return"MultiplexIdentification profile";case"mlnk":return"MultiplexLink profile";case"mvis":return"MultiplexVisualization profile";default:return e}}},16:{name:"Color Space",value:function(e,t){return a(e,t,4)}},20:{name:"Connection Space",value:function(e,t){return a(e,t,4)}},24:{name:"ICC Profile Date",value:function(e,t){return function(e,t){var n=e.getUint16(t),r=e.getUint16(t+2)-1,i=e.getUint16(t+4),o=e.getUint16(t+6),a=e.getUint16(t+8),u=e.getUint16(t+10);return new Date(Date.UTC(n,r,i,o,a,u))}(e,t).toISOString()}},36:{name:"ICC Signature",value:function(e,t){return Qa(e.buffer.slice(t,t+4))}},40:{name:"Primary Platform",value:function(e,t){return a(e,t,4)},description:function(e){return eu(e)}},48:{name:"Device Manufacturer",value:function(e,t){return a(e,t,4)},description:function(e){return eu(e)}},52:{name:"Device Model Number",value:function(e,t){return a(e,t,4)}},64:{name:"Rendering Intent",value:function(e,t){return e.getUint32(t)},description:function(e){switch(e){case 0:return"Perceptual";case 1:return"Relative Colorimetric";case 2:return"Saturation";case 3:return"Absolute Colorimetric";default:return e}}},80:{name:"Profile Creator",value:function(e,t){return a(e,t,4)}}};function Qa(e){return l(new Uint8Array(e))}function eu(e){switch(e.toLowerCase()){case"appl":return"Apple";case"adbe":return"Adobe";case"msft":return"Microsoft";case"sunw":return"Sun Microsystems";case"sgi":return"Silicon Graphics";case"tgnt":return"Taligent";default:return e}}var tu={read:function(e,t,n,r){return n&&t[0].compressionMethod!==M?function(e,t,n){if(t[0].compressionMethod!==L)return{};var r=e.byteOffset||0,i=e.buffer.slice(r+t[0].offset,r+t[0].offset+t[0].length);return D(new DataView(new Uint8Array(i).buffer),t[0].compressionMethod,"utf-8","dataview",n).then(vu).catch(function(){return{}})}(e,t,r):function(e,t){try{for(var n=function(e){return Array.isArray(e)?new DataView(Uint8Array.from(e).buffer).buffer:e.buffer}(e),r=e.byteOffset||0,i=t.reduce(function(e,t){return e+t.length},0),o=Math.min(i,n.byteLength),a=new Uint8Array(o),u=0,f=function(e){for(var t=Object.create(null),n=0;n<e.length;n++)void 0===t[e[n].chunkNumber]&&(t[e[n].chunkNumber]=e[n]);return t}(t),s=1;s<=t.length;s++){var c=f[s];if(!c)throw Error("ICC chunk ".concat(s," not found"));var l=n.slice(r+c.offset,r+c.offset+c.length),d=new Uint8Array(l);a.set(d,u),u+=d.length}return vu(new DataView(a.buffer))}catch(e){return{}}}(e,t)}},nu=84,ru=128,iu="acsp",ou="desc",au="mluc",uu="text",fu="sig ",su=12,cu=12,lu=12,du=16,pu=1e3,gu=1e3,hu=1048576;function mu(e,t){return e.byteLength<t+su}function vu(e){var t=e.buffer,n=e.getUint32();if(e.byteLength!==n)throw Error("ICC profile length not matching");if(e.byteLength<nu)throw Error("ICC profile too short");for(var r={},i=Object.keys(Za),o=0;o<i.length;o++){var f=i[o],s=Za[f],c=s.value(e,parseInt(f,10)),l=c;s.description&&(l=s.description(c)),r[s.name]={value:c,description:l}}if(Qa(t.slice(36,40))!==iu)throw Error("ICC profile: missing signature");if(function(e){return e.byteLength<ru+4}(e))return r;for(var d=Math.min(e.getUint32(ru),gu),p=132,g={remaining:Math.min(e.byteLength,hu)},h=0;h<d;h++){if(mu(e,p))return r;var m=a(e,p,4),v=e.getUint32(p+4),y=e.getUint32(p+8);if(v>e.byteLength)return r;var b=a(e,v,4);if(b===ou){if(v+cu>e.byteLength)return r;var S=e.getUint32(v+8);if(S>y)return r;bu(r,m,yu(e,v+12,S-1,g))}else if(b===au){if(v+du>e.byteLength)return r;var x=e.getUint32(v+8),I=e.getUint32(v+12);if(I<lu)return r;if(x>pu)return r;var A=x*I;if(A>e.byteLength-v-du)return r;if(A>g.remaining)return r;g.remaining-=A;for(var P=Math.min(y,e.byteLength-v),T=v+du,E=[],C=0;C<x;C++){var U=a(e,T+0,2),O=a(e,T+2,2),w=e.getUint32(T+4),M=e.getUint32(T+8),L=Math.min(w,Math.max(0,P-M),g.remaining);g.remaining-=L;var F=u(e,v+M,L);E.push({languageCode:U,countryCode:O,text:F}),T+=I}if(1===x)bu(r,m,E[0].text);else{for(var R={},D=0;D<E.length;D++)R["".concat(E[D].languageCode,"-").concat(E[D].countryCode)]=E[D].text;bu(r,m,R)}}else if(b===uu){var N=yu(e,v+8,y-8,g),G=N.indexOf("\0");bu(r,m,-1===G?N:N.slice(0,G))}else b===fu&&bu(r,m,Qa(t.slice(v+8,v+12)));p+=12}return r}function yu(e,t,n,r){var i=Math.max(0,Math.min(n,e.byteLength-t,r.remaining));return r.remaining-=i,Qa(e.buffer.slice(t,t+i))}function bu(e,t,n){$a[t]?e[$a[t].name]={value:n,description:n}:e[t]={value:n,description:n}}var Su={read:function(e,t,n,r,i){var o=ti(e,Sr,t,t+n,r,i,arguments.length>5&&void 0!==arguments[5]?arguments[5]:0,arguments.length>6&&void 0!==arguments[6]?arguments[6]:void 0,"makerNotes",arguments.length>7&&void 0!==arguments[7]?arguments[7]:void 0);return o.ShotInfo&&delete(o=S({},o,function(e){var t={},n=e[27];return Number.isFinite(n)&&(t.AutoRotate={value:n,description:xu(n)}),t}(o.ShotInfo.value))).ShotInfo,o.CameraSettings&&delete(o=S({},o,function(e){var t={};if(!Array.isArray(e))return t;var n=e[22];return Number.isFinite(n)&&(t.LensType={value:n,description:"".concat(n)}),t}(o.CameraSettings.value))).CameraSettings,o},SHOT_INFO_AUTO_ROTATE:27,CAMERA_SETTINGS_LENS_TYPE:22};function xu(e){return 0===e?"None":1===e?"Rotate 90 CW":2===e?"Rotate 180":3===e?"Rotate 270 CW":"Unknown"}var Iu={K3_III:78420},Au={CAMERA_ORIENTATION:1,ROLL_ANGLE:3,PITCH_ANGLE:5},Pu={read:function(e,t,n,r){var i,o=arguments.length>4&&void 0!==arguments[4]?arguments[4]:0,a=arguments.length>5&&void 0!==arguments[5]?arguments[5]:void 0,u=arguments.length>6&&void 0!==arguments[6]?arguments[6]:void 0;try{var f=Me.getByteOrder(e,t+n+8),s=t+n,c=ti(e,xr,s,s+10,f,r,o,a,"makerNotes",u);return function(e){return e.PentaxModelID&&e.PentaxModelID.value===Iu.K3_III&&e.LevelInfo}(c)?(c=S({},c,function(e,t,n,r){var i,o={},a=r===Me.LITTLE_ENDIAN;if(Tu(Au.CAMERA_ORIENTATION,1,n)){var u=e.getInt8(t+Au.CAMERA_ORIENTATION);o.CameraOrientation={value:u,description:(i=u,0===i?"Horizontal (normal)":1===i?"Rotate 270 CW":2===i?"Rotate 180":3===i?"Rotate 90 CW":4===i?"Upwards":5===i?"Downwards":"Unknown")}}if(Tu(Au.ROLL_ANGLE,2,n)){var f=e.getInt16(t+Au.ROLL_ANGLE,a);o.RollAngle={value:f,description:Eu(f)}}if(Tu(Au.PITCH_ANGLE,2,n)){var s=e.getInt16(t+Au.PITCH_ANGLE,a);o.PitchAngle={value:s,description:Cu(s)}}return o}(e,s+c.LevelInfo.__offset,(i=c.LevelInfo.value,Array.isArray(i)&&"number"==typeof i[0]?i.length:0),f)),delete c.LevelInfo):c.LevelInfo&&delete c.LevelInfo.__offset,c}catch(e){return{}}},PENTAX_IFD_OFFSET:10,MODEL_ID:Iu,LIK3III:Au};function Tu(e,t,n){return e+t<=n}function Eu(e){return""+-.5*e}function Cu(e){return""+-.5*e}var Uu={read:function(e,t){for(var n={},r=0;r<Mu.length;r++)n[Mu[r].name]=Lu(e,t,Mu[r]);return n}},Ou={0:"Grayscale",2:"RGB",3:"Palette",4:"Grayscale with Alpha",6:"RGB with Alpha"},wu={0:"Noninterlaced",1:"Adam7 Interlace"},Mu=[{name:"Image Width",offset:0,size:4,read:Tr.getLongAt,description:function(e){return"".concat(e,"px")}},{name:"Image Height",offset:4,size:4,read:Tr.getLongAt,description:function(e){return"".concat(e,"px")}},{name:"Bit Depth",offset:8,size:1,read:Tr.getByteAt,description:function(e){return"".concat(e)}},{name:"Color Type",offset:9,size:1,read:Tr.getByteAt,description:function(e){return Ou[e]||"Unknown"}},{name:"Compression",offset:10,size:1,read:Tr.getByteAt,description:function(e){return 0===e?"Deflate/Inflate":"Unknown"}},{name:"Filter",offset:11,size:1,read:Tr.getByteAt,description:function(e){return 0===e?"Adaptive":"Unknown"}},{name:"Interlace",offset:12,size:1,read:Tr.getByteAt,description:function(e){return wu[e]||"Unknown"}}];function Lu(e,t,n){if(!(t+n.offset+n.size>e.byteLength)){var r=n.read(e,t+n.offset);return{value:r,description:n.description(r)}}}var Fu={read:function(e,t,n,r){for(var i,o,u,f,s=arguments.length>4&&void 0!==arguments[4]?arguments[4]:0,c=arguments.length>5&&void 0!==arguments[5]?arguments[5]:_r,l=arguments.length>6?arguments[6]:void 0,d=arguments.length>7?arguments[7]:void 0,p=arguments.length>8?arguments[8]:void 0,g=arguments.length>9?arguments[9]:void 0,h={},m=[],v=[],y=0;y<t.length;y++){var b=t[y],A=e.getUint32(b+ln),P=a(e,b+dn,cn),T=qu(e,b+pn,A,P);if(T)if(T.compressionMethod===M){var E=Yu(T);$u(E)?m.push(E):E.name&&c.shouldParseGroup("png")&&x(h,I(E.name),{value:E.value,description:E.description})}else n&&v.length<zu&&v.push(T)}for(var C=m.some(function(e){return sf(e.name,e.value)})||v.some(Ku),U=0;U<m.length;U++){var O=Zu(m[U],r,s,c,d,u?void 0:p,g,0,C);O.embeddedExifTags&&(i=S(i||{},O.embeddedExifTags)),O.exifCarriedGroups&&(f=Ju(f||{},O.exifCarriedGroups)),O.embeddedExifThumbnail&&(u=O.embeddedExifThumbnail),O.embeddedIptcTags&&(o=S(o||{},O.embeddedIptcTags))}var w=u?void 0:p,L=v.map(function(e){return function(){return function(e,t){var n=e.type,r=e.keywordChars,i=e.langChars,o=e.compressionMethod,a=e.valueChars;return void 0===a?Promise.resolve(Qu(n,i,r)):D(a,o,rf(n),"string",t).then(function(e){return of(e,n,i,r)}).catch(function(){return Qu(n,i,r)})}(e,l).then(function(e){return Zu(e,r,s,c,d,w,g,1,C)})}});return{readTags:h,embeddedExifTags:i,embeddedIptcTags:o,embeddedExifThumbnail:u,exifCarriedGroups:f,readTagsPromise:L.length>0?ef(L,Vu):void 0}}},Ru="STATE_KEYWORD",Du="STATE_COMPRESSION",Nu="STATE_LANG",Gu="STATE_TRANSLATED_KEYWORD",ku="STATE_TEXT",_u=1,Bu=1,ju=6,zu=255,Vu=4,Xu=79,Hu="raw profile type iptc",Wu=79;function Ku(e){return af(e.type,e.langChars,e.keywordChars).toLowerCase()===Hu}function Ju(e,t){for(var n=Object.keys(t),r=0;r<n.length;r++)e[n[r]]=S(e[n[r]]||{},t[n[r]]);return e}function qu(e,t,n,r){for(var i,o=[],a=[],u=Ru,f=M,s=e.byteOffset||0,c=Math.min(t+n,e.byteLength),l=0;l<n&&t+l<e.byteLength;l++)if(u!==Du){if(u===ku){var d=e.buffer.slice(s+t+l,s+t+n);i=new DataView(new Uint8Array(d).buffer);break}var p=e.getUint8(t+l);if(0===p)u=nf(r,u);else if(u===Ru){if(o.length>=Xu)return;o.push(p)}else if(u===Nu){if(a.length>=Wu)return;a.push(p)}}else f=tf({type:r,dataView:e,offset:t+l,chunkEnd:c}),r===mn&&(l+=_u),u=nf(r,u);return{type:r,keywordChars:o,langChars:a,compressionMethod:f,valueChars:i}}function Yu(e){var t=e.type,n=e.keywordChars,r=e.langChars;return of(D(e.valueChars,M,rf(t),"string"),t,r,n)}function $u(e){var t=e.name,n=e.value;return ff(t,n)||sf(t,n)}function Zu(e,t,n,r,i,o,a,u,f){var s=e.name,c=e.value,l=e.description;try{if(Ae.USE_EXIF&&ff(s,c)){if(!r.shouldParseGroup("exif"))return{};var d=cf(c);u&&ii(i,d.byteLength);var p=pi.read(d,ju,t,n,r,i),g=p.tags,h=p.byteOrder,m={embeddedExifTags:g};a&&(m.exifCarriedGroups=a(d,g,ju,h,i,{decompressed:u,hasIptcBlock:f})),g.MakerNote&&delete g.MakerNote.__offset;var v=li(g,d,ju,o);return v&&(m.embeddedExifThumbnail=v),m}if(Ae.USE_IPTC&&sf(s,c)){if(!r.shouldParseGroup("iptc"))return{};var y=cf(c);return u&&function(e,t){if(void 0!==e){var n=Math.min(Math.floor(t/5),e.decompressedIptcAllowanceRemaining);e.iptcDatasetsRemaining+=n,e.decompressedIptcAllowanceRemaining-=n}}(i,y.byteLength),{embeddedIptcTags:no.read(y,0,t,r,i)}}if(s&&!ff(s,c)&&!sf(s,c)){if(!r.shouldParseGroup("png"))return{};var b={};return x(b,I(s),{value:c,description:l}),{readTags:b}}}catch(e){}return{}}function Qu(e,t,n){return of("<text using unknown compression>",e,t,n)}function ef(e,t){for(var n=[],r=[],i=0,o=0;o<Math.min(t,e.length);o++)r.push(a());return Promise.all(r).then(function(){return n});function a(){if(i>=e.length)return Promise.resolve();var t=i++;return new Promise(function(n){return n(e[t]())}).then(function(e){return n[t]=e,a()})}}function tf(e){var t=e.type,n=e.dataView,r=e.offset,i=e.chunkEnd;if(t===mn){if(r+1<i&&n.getUint8(r)===Bu)return n.getUint8(r+1)}else if(t===vn)return n.getUint8(r);return M}function nf(e,t){return t===Ru&&[mn,vn].includes(e)?Du:t===Du?e===mn?Nu:ku:t===Nu?Gu:ku}function rf(e){return e===hn||e===vn?"latin1":"utf-8"}function of(e,t,n,r){var i=function(e){return e instanceof DataView?a(e,0,e.byteLength):e}(e);return{name:af(t,n,r),value:i,description:t===mn?uf(e):i}}function af(e,t,n){var r=c(n);if(e===hn||0===t.length)return r;var i=c(t);return"".concat(r," (").concat(i,")")}function uf(e){return to("UTF-8",e)}function ff(e,t){return"raw profile type exif"===e.toLowerCase()&&"exif"===t.substring(1,5)}function sf(e,t){return e.toLowerCase()===Hu&&"iptc"===t.substring(1,5)}function cf(e){var t=/\n(exif|iptc)\n\s*\d+\n/.exec(e);if(!t)throw Error("Invalid raw profile header.");var n=t.index+t[0].length,r=function(e,t){for(var n=0,r=t;r<e.length;r++)U(e.charCodeAt(r))>=0&&n++;return n}(e,n);if(r%2!=0)throw Error("Odd number of hex digits in raw profile.");for(var i=new Uint8Array(r/2),o=0,a=-1,u=n;u<e.length;u++){var f=U(e.charCodeAt(u));f<0||(a<0?a=f:(i[o++]=a<<4|f,a=-1))}return new DataView(i.buffer)}var lf={read:function(e,t){for(var n={},r=0;r<t.length;r++){var i=Tr.getLongAt(e,t[r]+ln),o=a(e,t[r]+dn,cn);o===yn?(n["Pixels Per Unit X"]=df(e,t[r],i),n["Pixels Per Unit Y"]=pf(e,t[r],i),n["Pixel Units"]=gf(e,t[r],i)):o===bn&&(n["Modify Date"]=hf(e,t[r],i))}return n}};function df(e,t,n){if(mf(e,t,n,0,4)){var r=Tr.getLongAt(e,t+pn+0);return{value:r,description:""+r}}}function pf(e,t,n){if(mf(e,t,n,4,4)){var r=Tr.getLongAt(e,t+pn+4);return{value:r,description:""+r}}}function gf(e,t,n){if(mf(e,t,n,8,1)){var r=Tr.getByteAt(e,t+pn+8);return{value:r,description:1===r?"meters":"Unknown"}}}function hf(e,t,n){if(mf(e,t,n,0,7)){var r=Tr.getShortAt(e,t+pn),i=Tr.getByteAt(e,t+pn+2),o=Tr.getByteAt(e,t+pn+3),a=Tr.getByteAt(e,t+pn+4),u=Tr.getByteAt(e,t+pn+5),f=Tr.getByteAt(e,t+pn+6);return{value:[r,i,o,a,u,f],description:"".concat(vf(r,4),"-").concat(vf(i,2),"-").concat(vf(o,2)," ").concat(vf(a,2),":").concat(vf(u,2),":").concat(vf(f,2))}}}function mf(e,t,n,r,i){return r+i<=n&&t+pn+r+i<=e.byteLength}function vf(e,t){return O(""+e,t,"0")}var yf={read:function(e,t){var n={};if(t+xf>e.byteLength)return n;var r=Tr.getByteAt(e,t);return n.Alpha=function(e){var t=16&e;return{value:t?1:0,description:t?"Yes":"No"}}(r),n.Animation=function(e){var t=2&e;return{value:t?1:0,description:t?"Yes":"No"}}(r),n.ImageWidth=If(e,t+bf),n.ImageHeight=If(e,t+Sf),n}},bf=4,Sf=7,xf=10;function If(e,t){var n=Tr.getByteAt(e,t)+256*Tr.getByteAt(e,t+1)+65536*Tr.getByteAt(e,t+2)+1;return{value:n,description:n+"px"}}var Af={read:function(e){for(var t={},n=0;n<Tf.length;n++)t[Tf[n].name]=Ef(e,Tf[n]);return t}},Pf=function(e){return"".concat(e," ").concat(1===e?"bit":"bits")},Tf=[{name:"GIF Version",offset:3,size:3,getValue:function(e,t){return a(e,t,3)},description:function(e){return e}},{name:"Image Width",offset:6,size:2,getValue:function(e,t){return e.getUint16(t,1)},description:function(e){return"".concat(e,"px")}},{name:"Image Height",offset:8,size:2,getValue:function(e,t){return e.getUint16(t,1)},description:function(e){return"".concat(e,"px")}},{name:"Global Color Map",offset:10,size:1,getValue:function(e,t){return(128&e.getUint8(t))>>>7},description:function(e){return 1===e?"Yes":"No"}},{name:"Bits Per Pixel",offset:10,size:1,getValue:function(e,t){return 1+(7&e.getUint8(t))},description:Pf},{name:"Color Resolution Depth",offset:10,size:1,getValue:function(e,t){return((112&e.getUint8(t))>>>4)+1},description:Pf}];function Ef(e,t){if(!(t.offset+t.size>e.byteLength)){var n=t.getValue(e,t.offset);return{value:n,description:t.description(n)}}}var Cf=[6,7,99],Uf={get:function(e,t,n){if((a=t)&&(void 0===a.Compression||Cf.includes(a.Compression.value))&&a.JPEGInterchangeFormat&&a.JPEGInterchangeFormat.value&&a.JPEGInterchangeFormatLength&&a.JPEGInterchangeFormatLength.value){var r=n+t.JPEGInterchangeFormat.value,i=t.JPEGInterchangeFormatLength.value;if(function(e,t,n){return Of(t)&&Of(n)&&t+n<=e.byteLength}(e,r,i)){t.type="image/jpeg";var o=e.byteOffset||0;t.image=e.buffer.slice(o+r,o+r+i),A(t,"base64",function(){return P(this.image)})}}var a;return t}};function Of(e){return"number"==typeof e&&e>=0&&e%1==0}var wf={get:function(e,t){var n={},r=0,i=Lf(Mf(e,"exif","FocalLength",t)),o=Lf(Mf(e,"exif","FocalPlaneXResolution",t)),a=Lf(Mf(e,"exif","FocalPlaneYResolution",t)),u=Ff(Mf(e,"exif","FocalPlaneResolutionUnit",t)),f=function(e,t){var n=Ff(Mf(e,"exif","PixelXDimension",t)),r=Ff(Mf(e,"exif","PixelYDimension",t));return n&&r?{width:n,height:r}:{width:Ff(Mf(e,"file","Image Width",t)),height:Ff(Mf(e,"file","Image Height",t))}}(e,t),s=Ff(Mf(e,"exif","FocalLengthIn35mmFilm",t))||function(e,t,n,r,i,o){if(e&&t&&n&&r&&i&&o){var a;switch(n){case 2:a=25.4;break;case 3:a=10;break;case 4:a=1;break;default:return}var u=i/(t/a);return Ff(o*(43.27/Math.sqrt(Math.pow(r/(e/a),2)+Math.pow(u,2))))}}(o,a,u,f.width,f.height,i);s&&(n.FocalLength35efl={value:s,description:er.FocalLengthIn35mmFilm(s)},r=1);var c=function(e,t){if(e&&t){var n=Ff(t/e);if(n)return{value:n,description:n.toFixed(1)}}}(i,s);c&&(n.ScaleFactorTo35mmEquivalent=c,r=1);var l=function(e){if(e){var t=Ff(2*Math.atan(36/(2*e))*(180/Math.PI));if(t)return{value:t,description:t.toFixed(1)+" deg"}}}(s);if(l&&(n.FieldOfView=l,r=1),r)return n}};function Mf(e,t,n,r){return r&&e[t]&&e[t][n]?e[t][n].value:!r&&e[n]?e[n].value:void 0}function Lf(e){if("string"==typeof e){var t=e.split("/",3);return 1===t.length?Ff(e):Rf(t)}return Array.isArray(e)?Rf(e):Ff(e)}function Ff(e){var t;return"number"==typeof e?t=e:"string"==typeof e&&(t=Number(e)),t>0&&t<1/0?t:void 0}function Rf(e){if(2===e.length)return Ff(Ff(e[0])/Ff(e[1]))}var Df=["iptc","xmp","photoshop","icc","makerNotes"];function Nf(e){for(var t=e.mergeSteps,n=e.deferredResults,r=e.parsedGroups,i=e.expanded,o=e.tagFilter,a=e.dataView,u=e.tiffHeaderOffset,f=e.exifDataView,s=e.fileType,c=e.pngTextChunks,l=e.pngTextIsAsync,d=e.thumbnailIfdTags,p=e.deps,g={},h=[],m=0;m<t.length;m++)g=Gf({step:t[m],deferredResults:n,parsedGroups:r,expanded:i,tagFilter:o,dataView:a,tiffHeaderOffset:u,exifDataView:f,fileType:s,thumbnailIfdTags:d,embeddedExifThumbnails:h,tags:g,deps:p});return Ae.USE_PNG&&i&&l&&o.shouldReturnGroup("png")&&g.png&&(g.pngText=p.objectAssign({},g.png)),Ae.USE_PNG&&i&&o.shouldReturnGroup("png")&&p.hasPngTextData(c)&&g.png&&!g.pngText&&(g.pngText=p.objectAssign({},g.png)),g}function Gf(e){var t=e.step,n=e.deferredResults,r=e.parsedGroups,i=e.expanded,o=e.tagFilter,a=e.dataView,u=e.tiffHeaderOffset,f=e.exifDataView,s=e.fileType,c=e.thumbnailIfdTags,l=e.embeddedExifThumbnails,d=void 0===l?[]:l,p=e.tags,g=e.deps;if("mergeGroupAssign"===t.type){var h=g.filterTagsForReturn(t.groupKey,t.parsedTags,o);return Bf(p,t.groupKey,h,i,g)}if("mergeGroupMerge"===t.type){var m=g.filterTagsForReturn(t.groupKey,t.parsedTags,o);return function(e,t,n,r,i){return r?(e[t]?e[t]=i.objectAssign({},e[t],n):e[t]=n,e):i.objectAssign({},e,n)}(p,t.groupKey,m,i,g)}if(Ae.USE_XMP&&"mergeXmpGroupAssign"===t.type)return jf(p,g.filterTagsForReturn("xmp",t.parsedTags,o),i,g);if(Ae.USE_ICC&&"mergeIccDeferred"===t.type){var v=n[t.deferredKey],y=g.filterTagsForParse("icc",v,o);return r.icc=y,o.shouldReturnGroup("icc")?Bf(p,"icc",g.filterTagsForReturn("icc",y,o),i,g):p}if(Ae.USE_JXL&&"mergeBrobExifDeferred"===t.type){var b=n[t.deferredKey];return b?(kf(d,b.thumbnail),0===Object.keys(b.exifTags).length?p:Vf({exifTags:b.exifTags,carriedGroups:b.carriedGroups,parsedGroups:r,expanded:i,tagFilter:o,tags:p,deps:g,merge:Xf(g)})):p}if(Ae.USE_JXL&&"mergeBrobXmpDeferred"===t.type){var S=n[t.deferredKey];if(!S||0===Object.keys(S).length)return p;var x=g.filterTagsForParse("xmp",S,o);return r.xmp=x,o.shouldReturnGroup("xmp")?jf(p,g.filterTagsForReturn("xmp",x,o),i,g):p}if(Ae.USE_PNG&&"mergePngFile"===t.type){var I=g.filterTagsForReturn("png",t.parsedTags,o);return o.shouldReturnGroup("png")?i?(p.png=p.png?g.objectAssign({},p.png,I):I,p.pngFile=I,p):g.objectAssign({},p,I):p}if(Ae.USE_PNG&&"mergePngChunk"===t.type){var A=g.filterTagsForReturn("png",t.parsedTags,o);return o.shouldReturnGroup("png")?i?(p.png=p.png?g.objectAssign({},p.png,A):A,p):g.objectAssign({},p,A):p}if(Ae.USE_PNG&&"processPngTextReadTags"===t.type)return kf(d,t.embeddedExifThumbnail),zf({readTags:t.readTags,embeddedExifTags:t.embeddedExifTags,exifCarriedGroups:t.exifCarriedGroups,embeddedIptcTags:t.embeddedIptcTags,parsedGroups:r,expanded:i,tagFilter:o,tags:p,deps:g});if(Ae.USE_PNG&&"processPngTextReadTagsDeferredList"===t.type){for(var P=n[t.deferredKey]||[],T=function(e){var t=[];return{group:function(t,r,i){t[r]=n(t[r]),e.objectAssign(t[r],i)},topLevel:function(t,r){return e.objectAssign(n(t),r)}};function n(n){if(-1!==t.indexOf(n))return n;var r=e.objectAssign({},n);return t.push(r),r}}(g),E=0;E<P.length;E++){var C=P[E];kf(d,C.embeddedExifThumbnail),p=zf({readTags:C.readTags||{},embeddedExifTags:C.embeddedExifTags,exifCarriedGroups:C.exifCarriedGroups,embeddedIptcTags:C.embeddedIptcTags,parsedGroups:r,expanded:i,tagFilter:o,tags:p,deps:g,merge:T})}return p}if(Ae.USE_EXIF&&"gps"===t.type){if(i&&o.shouldReturnGroup("gps")&&r.exif){var U=g.getGpsGroupFromExifTags(r.exif);if(U){var O=g.filterTagsForReturn("gps",U,o);p.gps=O}}return p}if((Ae.USE_EXIF||Ae.USE_XMP)&&"composite"===t.type){if(!o.shouldReturnGroup("composite"))return p;var w=p,M=i;o.isActive&&(w={exif:r.exif,file:r.file},M=1);var L=g.Composite.get(w,M);return L?Bf(p,"composite",g.filterTagsForReturn("composite",L,o),i,g):p}if("thumbnail"===t.type){if(delete p.Thumbnail,!o.shouldReturnGroup("thumbnail")||!o.shouldReturnTag("thumbnail","Thumbnail"))return p;var F=function(e){var t=e.thumbnailIfdTags,n=e.tagFilter,r=e.dataView,i=e.exifDataView,o=e.tiffHeaderOffset,a=e.deps;if(t){var u=a.filterTagsForParse("thumbnail",t,n);return Ae.USE_EXIF&&Ae.USE_THUMBNAIL&&a.Thumbnail.get(i||r,u,o)}}({thumbnailIfdTags:c,tagFilter:o,dataView:a,exifDataView:f,tiffHeaderOffset:u,deps:g}),R=F;return _f(F)||(R=function(e){if((Ae.USE_PNG||Ae.USE_JXL)&&Ae.USE_EXIF&&Ae.USE_THUMBNAIL)return e.filter(_f)[0]}(d)||F),R&&(p.Thumbnail=R),p}if("metadataRange"===t.type){if(!i)return p;var D=function(e,t,n,r){var i=(e||[]).slice(),o=!!t;if(r&&r.mpf&&Array.isArray(r.mpf.Images))for(var a=0;a<r.mpf.Images.length;a++){var u=r.mpf.Images[a];if(u&&u.ImageOffset&&u.ImageSize){var f=u.ImageOffset.value,s=u.ImageSize.value;"number"!=typeof f||f<=0||"number"!=typeof s||s<=0||i.push({type:"mpfImage",start:f,end:f+s})}}if(0!==i.length){i.sort(function(e,t){return e.start-t.start});for(var c=i[0].start,l=i[0].end,d=1;d<i.length;d++)i[d].end>l&&(l=i[d].end);var p=n&&"number"==typeof n.byteLength?n.byteLength:0;return{start:c,end:l,complete:!o&&l<=p,blocks:i}}}(t.metadataBlocks,t.metadataTruncated,a,r);return D&&(p.metadataRange=D),p}return"fileType"===t.type?(delete p.FileType,s&&o.shouldReturnGroup("file")&&o.shouldReturnTag("file","FileType")&&(i?(p.file||(p.file={}),p.file.FileType=s):p.FileType=s),p):p}function kf(e,t){t&&e.push(t)}function _f(e){return!!e&&!!e.image}function Bf(e,t,n,r,i){return r?(e[t]=n,e):i.objectAssign({},e,n)}function jf(e,t,n,r){if(n)return e.xmp=t,e;var i=r.objectAssign({},t);return delete i._raw,r.objectAssign({},e,i)}function zf(e){var t=e.readTags,n=e.embeddedExifTags,r=e.exifCarriedGroups,i=e.embeddedIptcTags,o=e.parsedGroups,a=e.expanded,u=e.tagFilter,f=e.tags,s=e.deps,c=e.merge,l=void 0===c?Xf(s):c;if(n&&(f=Vf({exifTags:n,carriedGroups:r||{},parsedGroups:o,expanded:a,tagFilter:u,tags:f,deps:s,merge:l})),i){var d=s.filterTagsForParse("iptc",i,u);if(l.group(o,"iptc",d),u.shouldReturnGroup("iptc")){var p=s.filterTagsForReturn("iptc",d,u);a?l.group(f,"iptc",p):f=l.topLevel(f,p)}}if(u.shouldReturnGroup("png")){var g=s.filterTagsForParse("png",t,u),h=s.filterTagsForReturn("png",g,u);o.pngText=g,a?(l.group(f,"png",h),h&&Object.keys(h).length>0&&l.group(f,"pngText",h)):f=l.topLevel(f,h)}return f}function Vf(e){for(var t=e.exifTags,n=e.carriedGroups,r=e.parsedGroups,i=e.expanded,o=e.tagFilter,a=e.tags,u=e.deps,f=e.merge,s=void 0,c=0;c<Df.length;c++){var l=Df[c],d=n[l];void 0!==d&&("xmp"!==l||i?a=h(l,d):s=d)}if(t){var p=u.filterTagsForParse("exif",t,o);if(f.group(r,"exif",p),o.shouldReturnGroup("exif")){var g=u.filterTagsForReturn("exif",p,o);i?f.group(a,"exif",g):a=f.topLevel(a,g)}}return void 0!==s&&(a=h("xmp",s,1)),a;function h(e,t,n){if(f.group(r,e,t),!o.shouldReturnGroup(e))return a;var s,c,l=u.filterTagsForReturn(e,t,o);return i?(f.group(a,e,l),a):f.topLevel(a,n?(s=l,delete(c=u.objectAssign({},s))._raw,c):l)}}function Xf(e){return{group:function(t,n,r){t[n]=t[n]?e.objectAssign({},t[n],r):r},topLevel:function(t,n){return e.objectAssign({},t,n)}}}function Hf(e){this.name="MetadataMissingError",this.message=e||"No Exif data",this.stack=Error().stack}Hf.prototype=Error();var Wf={MetadataMissingError:Hf},Kf=4,Jf=65536,qf=2,Yf=65536,$f={load:Qf,loadView:ts,errors:Wf},Zf=Wf;function Qf(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};if("auto"===t.length)return function(e){if(1!=e.expanded||1!=e.includeOffsets)throw Error('length: "auto" requires both expanded: true and includeOffsets: true.')}(t),be(es)(e,t);if(q(e)||Y(e)){b();var n=q(e)?Z:Q,r=S({},t,{async:1});return n(e,r).then(function(e){return es(e,r)})}return es(e,t)}function es(e,t){return function(e){try{return Buffer.isBuffer(e)}catch(e){return 0}}(e)&&(e=new Uint8Array(e).buffer),ts(o(e),t)}function ts(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=t.expanded,r=void 0===n?0:n,i=t.async,a=void 0===i?0:i,u=t.computed,f=void 0===u?0:u,s=t.includeUnknown,d=void 0===s?0:s,p=t.includeOffsets,g=void 0===p?0:p,h=t.domParser,m=void 0===h?void 0:h,v=t.includeTags,y=void 0===v?void 0:v,x=t.excludeTags,I=void 0===x?void 0:x,A=t.decompress,P=void 0===A?void 0:A;e=function(e){return function(e){return ns(e)&&(e.byteOffset>0||e.byteLength<e.buffer.byteLength)}(e)?o(e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)):e}(e),P=function(e){return{brotli:e?e.brotli:void 0,deflate:e?e.deflate:void 0,maxDecompressedSize:e?e.maxDecompressedSize:void 0,budget:{remaining:N(e),warned:0}}}(P);var T=function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},t=e.includeTags,n=e.excludeTags,r=!!t,i=!!n,o=r||i,a=Object.create(null),u=Object.create(null),f=Object.create(null);if(!o)return kr();var s=r&&(zr(t,"iptc")||zr(t,"xmp")||zr(t,"icc")||zr(t,"photoshop")||zr(t,"makerNotes")||zr(t,"thumbnail")||zr(t,"gps")||zr(t,"composite")),c=r&&zr(t,"composite"),l=Object.create(null);r&&(l=function(e){var t=function(e){var t=Object.create(null);if(!e)return t;for(var n in Array.isArray(e.exif)&&e.exif.length>0&&(t[Mr.exifIfdPointer]=1,function(e,t){for(var n=0;n<t.length;n++){var r=t[n];if("number"==typeof r&&(Lr[r]&&(e[Mr.gpsInfoIfdPointer]=1),Fr[r]&&(e[Mr.interoperabilityIfdPointer]=1)),"string"==typeof r){var i=r.toLowerCase();0===i.indexOf("gps")&&(e[Mr.gpsInfoIfdPointer]=1),0!==i.indexOf("interoperability")&&0!==i.indexOf("relatedimage")||(e[Mr.interoperabilityIfdPointer]=1)}}}(t,e.exif)),Dr)if(Gr(e[n])){for(var r=Dr[n],i=0;i<r.length;i++)t[r[i]]=1;t[Mr.exifIfdPointer]=1}return Gr(e.gps)&&(t[Mr.gpsInfoIfdPointer]=1,t[Mr.exifIfdPointer]=1),t}(e);return zr(e,"composite")&&(function(e,t){for(var n=0;n<t.length;n++)e[t[n]]=1}(t,Nr.exif),t[Mr.exifIfdPointer]=1),t}(t));var d=Object.create(null);for(var p in r&&c&&(d=function(e){for(var t=Object.create(null),n=0;n<e.length;n++)t[e[n].toLowerCase()]=1;return t}(Nr.file)),wr){var g=r&&Object.prototype.hasOwnProperty.call(t,p),h=void 0;i&&Object.prototype.hasOwnProperty.call(n,p)&&!g&&(h=n[p]);var m=Xr({groupKey:p,includeValue:g?t[p]:void 0,excludeValue:h,extraIncludeNames:Object.create(null)});a[p]=r?g:1,g&&Vr(t[p])&&(a[p]=0),m.excludeAll&&(a[p]=0),u[p]=m;var v=Xr({groupKey:p,includeValue:Br({groupKey:p,hasIncludeTags:r,hasIncludeEntry:g,includeTags:t,shouldParseExif:s,shouldParseFile:c}),excludeValue:h,extraIncludeNames:jr({groupKey:p,hasIncludeTags:r,hasIncludeEntry:g,shouldParseExif:s,shouldParseFile:c,exifIncludeDependencies:l,fileIncludeDependencies:d})});f[p]=v}return{isActive:o,shouldReturnGroup:y,shouldParseGroup:b,shouldReturnTag:function(e,t,n){return wr[e]?y(e)?Hr(u[e],t,n):0:1},shouldParseTag:function(e,t,n){return wr[e]?b(e)?Hr(f[e],t,n):0:1}};function y(e){return wr[e]?!!a[e]:1}function b(e){return wr[e]?y(e)?1:"exif"===e?s:"file"===e?c:0:1}}({includeTags:y,excludeTags:I}),E=Object.create(null),C=[],U=Object.create(null),O=[],w=0,M=void 0,L=void 0,R=void 0,G=0,k=Zn.parseAppMarkers(e,a,r&&g),_=k.fileType,B=k.fileDataOffset,j=k.jfifDataOffset,z=k.tiffHeaderOffset,V=k.iptcDataOffset,X=k.xmpChunks,H=k.iccChunks,W=k.mpfDataOffset,K=k.pngHeaderOffset,J=k.pngTextChunks,q=k.pngChunkOffsets,Y=k.vp8xChunkOffset,$=k.gifHeaderOffset,Z=k.brobExifChunk,Q=k.brobXmpChunk,ee=k.jxlCodestreamOffset,te=k.imageDimensionsOffset,ne=k.pixelInformationOffset,re=k.metadataBlocks,ie=k.metadataTruncated,oe=k.exifDataView,ae=k.xmpDataView,ue=function(e){var t=e.fileDataOffset,n=e.jfifDataOffset,r=e.tiffHeaderOffset,i=e.iptcDataOffset,o=e.xmpChunks,a=e.iccChunks,u=e.mpfDataOffset,f=e.pngHeaderOffset,s=e.pngTextChunks,c=e.pngChunkOffsets,l=e.vp8xChunkOffset,d=e.gifHeaderOffset,p=e.jxlCodestreamOffset,g=e.imageDimensionsOffset,h=e.pixelInformationOffset;return!!e.fileType||Ae.USE_JPEG&&Ae.USE_FILE&&void 0!==t||Ae.USE_JPEG&&Ae.USE_JFIF&&void 0!==n||Ae.USE_EXIF&&void 0!==r||Ae.USE_JPEG&&Ae.USE_IPTC&&void 0!==i||Ae.USE_XMP&&ss(o)||Ae.USE_ICC&&cs(a)||Ae.USE_MPF&&void 0!==u||Ae.USE_PNG&&Ae.USE_PNG_FILE&&void 0!==f||Ae.USE_PNG&&ls(s)||Ae.USE_PNG&&void 0!==c||Ae.USE_WEBP&&void 0!==l||Ae.USE_GIF&&void 0!==d||Ae.USE_JXL&&void 0!==p||(Ae.USE_HEIC||Ae.USE_AVIF)&&(void 0!==g||void 0!==h)}({fileType:_,fileDataOffset:B,jfifDataOffset:j,tiffHeaderOffset:z,iptcDataOffset:V,xmpChunks:X,iccChunks:H,mpfDataOffset:W,pngHeaderOffset:K,pngTextChunks:J,pngChunkOffsets:q,vp8xChunkOffset:Y,gifHeaderOffset:$,jxlCodestreamOffset:ee});if(Ae.USE_JPEG&&Ae.USE_FILE&&void 0!==B&&T.shouldParseGroup("file")&&function(e){if(!e)return 1;var t=e.composite,n=e.file;return 1==t||Array.isArray(t)&&t.length>0?1:!(Array.isArray(n)&&1===n.length&&"FileType"===n[0])}(y)){var fe=os("file",Pi.read(e,B),T);E.file=fe,T.shouldReturnGroup("file")&&C.push({type:"mergeGroupAssign",groupKey:"file",parsedTags:fe})}if(Ae.USE_JPEG&&Ae.USE_JFIF&&void 0!==j&&T.shouldParseGroup("jfif")){var se=os("jfif",Bi.read(e,j),T);E.jfif=se,T.shouldReturnGroup("jfif")&&C.push({type:"mergeGroupAssign",groupKey:"jfif",parsedTags:se})}if(Ae.USE_EXIF&&void 0!==z&&T.shouldParseGroup("exif")){var ce=function(e,t,n,r,i){var o=void 0===e?void 0:ri(e);try{var a=pi.read(e,t,n,r,i,o);return{tags:a.tags,byteOrder:a.byteOrder,valueBudget:o}}catch(e){return{tags:{},byteOrder:Me.BIG_ENDIAN,valueBudget:o}}}(oe||e,z,d,f,T),le=ce.tags,de=ce.byteOrder,pe=ce.valueBudget;L=pe,le.Thumbnail&&(M=le.Thumbnail,delete le.Thumbnail);var ge=os("exif",le,T);E.exif=ge;for(var he=Xe(ge,oe||e,z,de,L,{decompressed:0,hasIptcBlock:void 0!==V}),me=0;me<Df.length;me++){var ve=Df[me];if(void 0!==he[ve]&&(E[ve]=he[ve],T.shouldReturnGroup(ve)))if("xmp"===ve){var ye={type:"mergeXmpGroupAssign",parsedTags:he.xmp};r?C.push(ye):R=ye}else C.push({type:"mergeGroupAssign",groupKey:ve,parsedTags:he[ve]})}T.shouldReturnGroup("exif")&&C.push({type:"mergeGroupAssign",groupKey:"exif",parsedTags:ge}),!r&&R&&(C.push(R),R=void 0)}if(void 0===L&&void 0!==e&&(L=ri(e)),Ae.USE_JPEG&&Ae.USE_IPTC&&void 0!==V&&T.shouldParseGroup("iptc")){var be=os("iptc",no.read(e,V,d,T,L),T);E.iptc=be,T.shouldReturnGroup("iptc")&&C.push({type:"mergeGroupAssign",groupKey:"iptc",parsedTags:be})}if(Ae.USE_XMP&&ss(X)&&T.shouldParseGroup("xmp")){var Se=os("xmp",Do.read(ae||e,X,m),T);E.xmp=Se,T.shouldReturnGroup("xmp")&&C.push({type:"mergeXmpGroupAssign",parsedTags:Se})}var xe,Ie=function(e,t){if(Ae.USE_EXIF&&Ae.USE_THUMBNAIL&&e.shouldReturnTag("thumbnail","Thumbnail")){var n=0;return function(r,i,o){var a=os("thumbnail",i,e),u=a.JPEGInterchangeFormatLength;if(!function(e,t){return!!e&&"number"==typeof e.value&&e.value<=t}(u,qf*t.byteLength+Yf-n))return a;var f=Uf.get(r,a,o);return f.image&&(n+=u.value),f}}}(T,e);if(Ae.USE_JXL&&Ae.USE_EXIF&&Z&&void 0===z&&T.shouldParseGroup("exif")&&a){var Pe=rs(e,Z);O.push(D(Pe,F,void 0,"dataview",P).then(function(e){var t=Ze(e,0);ii(L,e.byteLength);var n=pi.read(e,t,d,f,T,L),r=n.tags,i=n.byteOrder,o=li(r,e,t,Ie),a=He(e,r,t,i,L,{decompressed:1,hasIptcBlock:0});U.brobExif={exifTags:r,carriedGroups:a,thumbnail:o}}).catch(function(){U.brobExif=void 0})),C.push({type:"mergeBrobExifDeferred",deferredKey:"brobExif"})}if(Ae.USE_JXL&&Ae.USE_XMP&&Q&&!ss(X)&&T.shouldParseGroup("xmp")&&a){var Te=rs(e,Q);O.push(D(Te,F,void 0,"dataview",P).then(function(t){is(t.byteLength,e)?U.brobXmp={}:U.brobXmp=Do.read(t,[{dataOffset:0,length:t.byteLength}],m)}).catch(function(){U.brobXmp={}})),C.push({type:"mergeBrobXmpDeferred",deferredKey:"brobXmp"})}if(Ae.USE_ICC&&cs(H)&&T.shouldParseGroup("icc")){var Ee=tu.read(e,H,a,P);if((xe=Ee)&&"function"==typeof xe.then){if(!a)throw Error("Promise is required when async mode is enabled.");O.push(Ee.then(function(e){U.iccApp=e})),C.push({type:"mergeIccDeferred",deferredKey:"iccApp"})}else{var Ce=os("icc",Ee,T);E.icc=Ce,T.shouldReturnGroup("icc")&&C.push({type:"mergeGroupAssign",groupKey:"icc",parsedTags:Ce})}}if(Ae.USE_MPF&&void 0!==W&&T.shouldParseGroup("mpf")){var Ue=os("mpf",hi.read(e,W,d,f,T,L),T);E.mpf=Ue,T.shouldReturnGroup("mpf")&&C.push({type:"mergeGroupAssign",groupKey:"mpf",parsedTags:Ue})}if(Ae.USE_PNG&&Ae.USE_PNG_FILE&&void 0!==K&&T.shouldParseGroup("png")){var Oe=os("png",Uu.read(e,K),T);E.pngFile=Oe,T.shouldReturnGroup("png")&&C.push({type:"mergePngFile",parsedTags:Oe})}if(Ae.USE_PNG&&ls(J)&&(T.shouldParseGroup("png")||T.shouldParseGroup("exif")||T.shouldParseGroup("iptc"))){var we=Fu.read(e,J,a,d,f,T,P,L,Ie,He),Le=we.readTags,Fe=we.embeddedExifTags,Re=we.embeddedIptcTags,De=we.embeddedExifThumbnail,Ne=we.exifCarriedGroups,Ge=we.readTagsPromise;w=!!Ge,C.push({type:"processPngTextReadTags",readTags:Le,embeddedExifTags:Fe,embeddedIptcTags:Re,embeddedExifThumbnail:De,exifCarriedGroups:Ne}),Ge&&(O.push(Ge.then(function(e){U.pngTextTagList=e})),C.push({type:"processPngTextReadTagsDeferredList",deferredKey:"pngTextTagList"}))}if(Ae.USE_PNG&&void 0!==q&&T.shouldParseGroup("png")){var ke=os("png",lf.read(e,q),T);E.pngChunk=ke,T.shouldReturnGroup("png")&&C.push({type:"mergePngChunk",parsedTags:ke})}if(Ae.USE_WEBP&&void 0!==Y&&T.shouldParseGroup("riff")){var _e=os("riff",yf.read(e,Y),T);E.riff=_e,T.shouldReturnGroup("riff")&&C.push({type:"mergeGroupMerge",groupKey:"riff",parsedTags:_e})}if(Ae.USE_GIF&&void 0!==$&&T.shouldParseGroup("gif")){var Be=os("gif",Af.read(e,$),T);E.gif=Be,T.shouldReturnGroup("gif")&&C.push({type:"mergeGroupMerge",groupKey:"gif",parsedTags:Be})}if(Ae.USE_JXL&&void 0!==ee&&T.shouldParseGroup("file")){var je=os("file",Mi.read(e,ee),T);E.file=je,T.shouldReturnGroup("file")&&C.push({type:"mergeGroupAssign",groupKey:"file",parsedTags:je})}if((Ae.USE_HEIC||Ae.USE_AVIF)&&(void 0!==te||void 0!==ne)&&T.shouldParseGroup("file")){var ze=os("file",Ni.read(e,te,ne),T);E.file=ze,T.shouldReturnGroup("file")&&C.push({type:"mergeGroupAssign",groupKey:"file",parsedTags:ze})}if(Ae.USE_EXIF&&C.push({type:"gps"}),(Ae.USE_EXIF||Ae.USE_XMP)&&C.push({type:"composite"}),C.push({type:"thumbnail"}),C.push({type:"fileType"}),r&&g&&C.push({type:"metadataRange",metadataBlocks:re,metadataTruncated:!!ie}),!ue)throw new Wf.MetadataMissingError;var Ve={objectAssign:S,hasPngTextData:ls,filterTagsForParse:os,filterTagsForReturn:as,getGpsGroupFromExifTags:Ae.USE_EXIF?fs:void 0,Composite:Ae.USE_EXIF||Ae.USE_XMP?wf:void 0,Thumbnail:Uf};return a?(b(),Promise.all(O).then(function(){return Nf({mergeSteps:C,deferredResults:U,parsedGroups:E,expanded:r,tagFilter:T,dataView:e,tiffHeaderOffset:z,exifDataView:oe,fileType:_,pngTextChunks:J,pngTextIsAsync:w,thumbnailIfdTags:M,deps:Ve})})):Nf({mergeSteps:C,deferredResults:U,parsedGroups:E,expanded:r,tagFilter:T,dataView:e,tiffHeaderOffset:z,exifDataView:oe,fileType:_,pngTextChunks:J,pngTextIsAsync:w,thumbnailIfdTags:M,deps:Ve});function Xe(t,n,r,i,o,a){var u,s,p={};try{if(Ae.USE_IPTC&&t["IPTC-NAA"]&&!a.hasIptcBlock&&T.shouldParseGroup("iptc")){var g=no.read(t["IPTC-NAA"].value,0,d,T,o);p.iptc=os("iptc",g,T)}if(Ae.USE_XMP&&t.ApplicationNotes&&function(e){return Array.isArray(e)&&"number"==typeof e[0]}(t.ApplicationNotes.value)&&!ss(X)&&T.shouldParseGroup("xmp")&&(!a.decompressed||(s=t.ApplicationNotes.value.length,!is(G+s,e)&&(G+=s,1)))){var h=Do.read(l(t.ApplicationNotes.value),void 0,m);p.xmp=os("xmp",h,T)}if(Ae.USE_PHOTOSHOP&&t.ImageSourceData&&t.PhotoshopSettings&&Array.isArray(t.PhotoshopSettings.value)&&T.shouldParseGroup("photoshop")){var v=za.read(t.PhotoshopSettings.value,d,T);p.photoshop=os("photoshop",v,T)}if(Ae.USE_ICC&&t.ICC_Profile&&!cs(H)&&T.shouldParseGroup("icc")){var y=tu.read(t.ICC_Profile.value,[{offset:0,length:t.ICC_Profile.value.length,chunkNumber:1,chunksTotal:1}]);p.icc=os("icc",y,T)}Ae.USE_MAKER_NOTES&&t.MakerNote&&T.shouldParseGroup("makerNotes")&&((u=t).Make&&u.Make.value&&Array.isArray(u.Make.value)&&"Canon"===u.Make.value[0]&&u.MakerNote&&u.MakerNote.__offset?p.makerNotes=Su.read(n,r,t.MakerNote.__offset,i,d,f,T,o):function(e){return Array.isArray(e.MakerNote.value)&&e.MakerNote.value.length>7&&"PENTAX "===c(e.MakerNote.value.slice(0,7))&&e.MakerNote.__offset}(t)&&(p.makerNotes=Pu.read(n,r,t.MakerNote.__offset,d,f,T,o)))}finally{t.MakerNote&&delete t.MakerNote.__offset}return p}function He(e,t,n,r,i,o){try{return Xe(os("exif",t,T),e,n,r,i,o)}catch(e){return{}}}}function ns(e){return!!e&&"function"==typeof e.getUint8&&"number"==typeof e.byteOffset&&"number"==typeof e.byteLength&&!!e.buffer&&"function"==typeof e.buffer.slice}function rs(e,t){var n=Math.max(0,Math.min(t.length,e.byteLength-t.dataOffset));if(ns(e))return new DataView(e.buffer,e.byteOffset+t.dataOffset,n);for(var r=new Uint8Array(n),i=0;i<n;i++)r[i]=e.getUint8(t.dataOffset+i);return new DataView(r.buffer)}function is(e,t){return e>Kf*t.byteLength+Jf}function os(e,t,n){return n.isActive?us(e,t,n.shouldParseTag):t}function as(e,t,n){return n.isActive?us(e,t,n.shouldReturnTag):t}function us(e,t,n){if(!t)return t;var r={};for(var i in t){var o=t[i];n(e,i,a(o))&&x(r,i,o)}return r;function a(e){if(e){if(Array.isArray(e)){if(0===e.length)return;return e[0].id}return e.id}}}function fs(e){var t=void 0;if(e.GPSLatitude&&e.GPSLatitudeRef){t=t||{};try{t.Latitude=Ue(e.GPSLatitude.value),"S"===e.GPSLatitudeRef.value.join("")&&(t.Latitude=-t.Latitude)}catch(e){}}if(e.GPSLongitude&&e.GPSLongitudeRef){t=t||{};try{t.Longitude=Ue(e.GPSLongitude.value),"W"===e.GPSLongitudeRef.value.join("")&&(t.Longitude=-t.Longitude)}catch(e){}}if(e.GPSAltitude&&e.GPSAltitudeRef){t=t||{};try{t.Altitude=e.GPSAltitude.value[0]/e.GPSAltitude.value[1],1===e.GPSAltitudeRef.value&&(t.Altitude=-t.Altitude)}catch(e){}}if(t)return t}function ss(e){return Array.isArray(e)&&e.length>0}function cs(e){return Array.isArray(e)&&e.length>0}function ls(e){return Array.isArray(e)&&e.length>0}}(),t;var e,t});

}).call(this)}).call(this,require("buffer").Buffer)
},{"@xmldom/xmldom":8,"buffer":15,"fs":12,"http":27,"https":18}],12:[function(require,module,exports){

},{}],13:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],14:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12}],15:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":13,"buffer":15,"ieee754":19}],16:[function(require,module,exports){
module.exports = {
  "100": "Continue",
  "101": "Switching Protocols",
  "102": "Processing",
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "203": "Non-Authoritative Information",
  "204": "No Content",
  "205": "Reset Content",
  "206": "Partial Content",
  "207": "Multi-Status",
  "208": "Already Reported",
  "226": "IM Used",
  "300": "Multiple Choices",
  "301": "Moved Permanently",
  "302": "Found",
  "303": "See Other",
  "304": "Not Modified",
  "305": "Use Proxy",
  "307": "Temporary Redirect",
  "308": "Permanent Redirect",
  "400": "Bad Request",
  "401": "Unauthorized",
  "402": "Payment Required",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "406": "Not Acceptable",
  "407": "Proxy Authentication Required",
  "408": "Request Timeout",
  "409": "Conflict",
  "410": "Gone",
  "411": "Length Required",
  "412": "Precondition Failed",
  "413": "Payload Too Large",
  "414": "URI Too Long",
  "415": "Unsupported Media Type",
  "416": "Range Not Satisfiable",
  "417": "Expectation Failed",
  "418": "I'm a teapot",
  "421": "Misdirected Request",
  "422": "Unprocessable Entity",
  "423": "Locked",
  "424": "Failed Dependency",
  "425": "Unordered Collection",
  "426": "Upgrade Required",
  "428": "Precondition Required",
  "429": "Too Many Requests",
  "431": "Request Header Fields Too Large",
  "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "505": "HTTP Version Not Supported",
  "506": "Variant Also Negotiates",
  "507": "Insufficient Storage",
  "508": "Loop Detected",
  "509": "Bandwidth Limit Exceeded",
  "510": "Not Extended",
  "511": "Network Authentication Required"
}

},{}],17:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}

},{}],18:[function(require,module,exports){
var http = require('http')
var url = require('url')

var https = module.exports

for (var key in http) {
  if (http.hasOwnProperty(key)) https[key] = http[key]
}

https.request = function (params, cb) {
  params = validateParams(params)
  return http.request.call(this, params, cb)
}

https.get = function (params, cb) {
  params = validateParams(params)
  return http.get.call(this, params, cb)
}

function validateParams (params) {
  if (typeof params === 'string') {
    params = url.parse(params)
  }
  if (!params.protocol) {
    params.protocol = 'https:'
  }
  if (params.protocol !== 'https:') {
    throw new Error('Protocol "' + params.protocol + '" not supported. Expected "https:"')
  }
  return params
}

},{"http":27,"url":47}],19:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],20:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],21:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],22:[function(require,module,exports){
(function (global){(function (){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],23:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],24:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],25:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":23,"./encode":24}],26:[function(require,module,exports){
/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.prototype = Object.create(Buffer.prototype)

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":15}],27:[function(require,module,exports){
(function (global){(function (){
var ClientRequest = require('./lib/request')
var response = require('./lib/response')
var extend = require('xtend')
var statusCodes = require('builtin-status-codes')
var url = require('url')

var http = exports

http.request = function (opts, cb) {
	if (typeof opts === 'string')
		opts = url.parse(opts)
	else
		opts = extend(opts)

	// Normally, the page is loaded from http or https, so not specifying a protocol
	// will result in a (valid) protocol-relative url. However, this won't work if
	// the protocol is something else, like 'file:'
	var defaultProtocol = global.location.protocol.search(/^https?:$/) === -1 ? 'http:' : ''

	var protocol = opts.protocol || defaultProtocol
	var host = opts.hostname || opts.host
	var port = opts.port
	var path = opts.path || '/'

	// Necessary for IPv6 addresses
	if (host && host.indexOf(':') !== -1)
		host = '[' + host + ']'

	// This may be a relative url. The browser should always be able to interpret it correctly.
	opts.url = (host ? (protocol + '//' + host) : '') + (port ? ':' + port : '') + path
	opts.method = (opts.method || 'GET').toUpperCase()
	opts.headers = opts.headers || {}

	// Also valid opts.auth, opts.mode

	var req = new ClientRequest(opts)
	if (cb)
		req.on('response', cb)
	return req
}

http.get = function get (opts, cb) {
	var req = http.request(opts, cb)
	req.end()
	return req
}

http.ClientRequest = ClientRequest
http.IncomingMessage = response.IncomingMessage

http.Agent = function () {}
http.Agent.defaultMaxSockets = 4

http.globalAgent = new http.Agent()

http.STATUS_CODES = statusCodes

http.METHODS = [
	'CHECKOUT',
	'CONNECT',
	'COPY',
	'DELETE',
	'GET',
	'HEAD',
	'LOCK',
	'M-SEARCH',
	'MERGE',
	'MKACTIVITY',
	'MKCOL',
	'MOVE',
	'NOTIFY',
	'OPTIONS',
	'PATCH',
	'POST',
	'PROPFIND',
	'PROPPATCH',
	'PURGE',
	'PUT',
	'REPORT',
	'SEARCH',
	'SUBSCRIBE',
	'TRACE',
	'UNLOCK',
	'UNSUBSCRIBE'
]
}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./lib/request":29,"./lib/response":30,"builtin-status-codes":16,"url":47,"xtend":50}],28:[function(require,module,exports){
(function (global){(function (){
exports.fetch = isFunction(global.fetch) && isFunction(global.ReadableStream)

exports.writableStream = isFunction(global.WritableStream)

exports.abortController = isFunction(global.AbortController)

// The xhr request to example.com may violate some restrictive CSP configurations,
// so if we're running in a browser that supports `fetch`, avoid calling getXHR()
// and assume support for certain features below.
var xhr
function getXHR () {
	// Cache the xhr value
	if (xhr !== undefined) return xhr

	if (global.XMLHttpRequest) {
		xhr = new global.XMLHttpRequest()
		// If XDomainRequest is available (ie only, where xhr might not work
		// cross domain), use the page location. Otherwise use example.com
		// Note: this doesn't actually make an http request.
		try {
			xhr.open('GET', global.XDomainRequest ? '/' : 'https://example.com')
		} catch(e) {
			xhr = null
		}
	} else {
		// Service workers don't have XHR
		xhr = null
	}
	return xhr
}

function checkTypeSupport (type) {
	var xhr = getXHR()
	if (!xhr) return false
	try {
		xhr.responseType = type
		return xhr.responseType === type
	} catch (e) {}
	return false
}

// If fetch is supported, then arraybuffer will be supported too. Skip calling
// checkTypeSupport(), since that calls getXHR().
exports.arraybuffer = exports.fetch || checkTypeSupport('arraybuffer')

// These next two tests unavoidably show warnings in Chrome. Since fetch will always
// be used if it's available, just return false for these to avoid the warnings.
exports.msstream = !exports.fetch && checkTypeSupport('ms-stream')
exports.mozchunkedarraybuffer = !exports.fetch && checkTypeSupport('moz-chunked-arraybuffer')

// If fetch is supported, then overrideMimeType will be supported too. Skip calling
// getXHR().
exports.overrideMimeType = exports.fetch || (getXHR() ? isFunction(getXHR().overrideMimeType) : false)

function isFunction (value) {
	return typeof value === 'function'
}

xhr = null // Help gc

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],29:[function(require,module,exports){
(function (process,global,Buffer){(function (){
var capability = require('./capability')
var inherits = require('inherits')
var response = require('./response')
var stream = require('readable-stream')

var IncomingMessage = response.IncomingMessage
var rStates = response.readyStates

function decideMode (preferBinary, useFetch) {
	if (capability.fetch && useFetch) {
		return 'fetch'
	} else if (capability.mozchunkedarraybuffer) {
		return 'moz-chunked-arraybuffer'
	} else if (capability.msstream) {
		return 'ms-stream'
	} else if (capability.arraybuffer && preferBinary) {
		return 'arraybuffer'
	} else {
		return 'text'
	}
}

var ClientRequest = module.exports = function (opts) {
	var self = this
	stream.Writable.call(self)

	self._opts = opts
	self._body = []
	self._headers = {}
	if (opts.auth)
		self.setHeader('Authorization', 'Basic ' + Buffer.from(opts.auth).toString('base64'))
	Object.keys(opts.headers).forEach(function (name) {
		self.setHeader(name, opts.headers[name])
	})

	var preferBinary
	var useFetch = true
	if (opts.mode === 'disable-fetch' || ('requestTimeout' in opts && !capability.abortController)) {
		// If the use of XHR should be preferred. Not typically needed.
		useFetch = false
		preferBinary = true
	} else if (opts.mode === 'prefer-streaming') {
		// If streaming is a high priority but binary compatibility and
		// the accuracy of the 'content-type' header aren't
		preferBinary = false
	} else if (opts.mode === 'allow-wrong-content-type') {
		// If streaming is more important than preserving the 'content-type' header
		preferBinary = !capability.overrideMimeType
	} else if (!opts.mode || opts.mode === 'default' || opts.mode === 'prefer-fast') {
		// Use binary if text streaming may corrupt data or the content-type header, or for speed
		preferBinary = true
	} else {
		throw new Error('Invalid value for opts.mode')
	}
	self._mode = decideMode(preferBinary, useFetch)
	self._fetchTimer = null
	self._socketTimeout = null
	self._socketTimer = null

	self.on('finish', function () {
		self._onFinish()
	})
}

inherits(ClientRequest, stream.Writable)

ClientRequest.prototype.setHeader = function (name, value) {
	var self = this
	var lowerName = name.toLowerCase()
	// This check is not necessary, but it prevents warnings from browsers about setting unsafe
	// headers. To be honest I'm not entirely sure hiding these warnings is a good thing, but
	// http-browserify did it, so I will too.
	if (unsafeHeaders.indexOf(lowerName) !== -1)
		return

	self._headers[lowerName] = {
		name: name,
		value: value
	}
}

ClientRequest.prototype.getHeader = function (name) {
	var header = this._headers[name.toLowerCase()]
	if (header)
		return header.value
	return null
}

ClientRequest.prototype.removeHeader = function (name) {
	var self = this
	delete self._headers[name.toLowerCase()]
}

ClientRequest.prototype._onFinish = function () {
	var self = this

	if (self._destroyed)
		return
	var opts = self._opts

	if ('timeout' in opts && opts.timeout !== 0) {
		self.setTimeout(opts.timeout)
	}

	var headersObj = self._headers
	var body = null
	if (opts.method !== 'GET' && opts.method !== 'HEAD') {
        body = new Blob(self._body, {
            type: (headersObj['content-type'] || {}).value || ''
        });
    }

	// create flattened list of headers
	var headersList = []
	Object.keys(headersObj).forEach(function (keyName) {
		var name = headersObj[keyName].name
		var value = headersObj[keyName].value
		if (Array.isArray(value)) {
			value.forEach(function (v) {
				headersList.push([name, v])
			})
		} else {
			headersList.push([name, value])
		}
	})

	if (self._mode === 'fetch') {
		var signal = null
		if (capability.abortController) {
			var controller = new AbortController()
			signal = controller.signal
			self._fetchAbortController = controller

			if ('requestTimeout' in opts && opts.requestTimeout !== 0) {
				self._fetchTimer = global.setTimeout(function () {
					self.emit('requestTimeout')
					if (self._fetchAbortController)
						self._fetchAbortController.abort()
				}, opts.requestTimeout)
			}
		}

		global.fetch(self._opts.url, {
			method: self._opts.method,
			headers: headersList,
			body: body || undefined,
			mode: 'cors',
			credentials: opts.withCredentials ? 'include' : 'same-origin',
			signal: signal
		}).then(function (response) {
			self._fetchResponse = response
			self._resetTimers(false)
			self._connect()
		}, function (reason) {
			self._resetTimers(true)
			if (!self._destroyed)
				self.emit('error', reason)
		})
	} else {
		var xhr = self._xhr = new global.XMLHttpRequest()
		try {
			xhr.open(self._opts.method, self._opts.url, true)
		} catch (err) {
			process.nextTick(function () {
				self.emit('error', err)
			})
			return
		}

		// Can't set responseType on really old browsers
		if ('responseType' in xhr)
			xhr.responseType = self._mode

		if ('withCredentials' in xhr)
			xhr.withCredentials = !!opts.withCredentials

		if (self._mode === 'text' && 'overrideMimeType' in xhr)
			xhr.overrideMimeType('text/plain; charset=x-user-defined')

		if ('requestTimeout' in opts) {
			xhr.timeout = opts.requestTimeout
			xhr.ontimeout = function () {
				self.emit('requestTimeout')
			}
		}

		headersList.forEach(function (header) {
			xhr.setRequestHeader(header[0], header[1])
		})

		self._response = null
		xhr.onreadystatechange = function () {
			switch (xhr.readyState) {
				case rStates.LOADING:
				case rStates.DONE:
					self._onXHRProgress()
					break
			}
		}
		// Necessary for streaming in Firefox, since xhr.response is ONLY defined
		// in onprogress, not in onreadystatechange with xhr.readyState = 3
		if (self._mode === 'moz-chunked-arraybuffer') {
			xhr.onprogress = function () {
				self._onXHRProgress()
			}
		}

		xhr.onerror = function () {
			if (self._destroyed)
				return
			self._resetTimers(true)
			self.emit('error', new Error('XHR error'))
		}

		try {
			xhr.send(body)
		} catch (err) {
			process.nextTick(function () {
				self.emit('error', err)
			})
			return
		}
	}
}

/**
 * Checks if xhr.status is readable and non-zero, indicating no error.
 * Even though the spec says it should be available in readyState 3,
 * accessing it throws an exception in IE8
 */
function statusValid (xhr) {
	try {
		var status = xhr.status
		return (status !== null && status !== 0)
	} catch (e) {
		return false
	}
}

ClientRequest.prototype._onXHRProgress = function () {
	var self = this

	self._resetTimers(false)

	if (!statusValid(self._xhr) || self._destroyed)
		return

	if (!self._response)
		self._connect()

	self._response._onXHRProgress(self._resetTimers.bind(self))
}

ClientRequest.prototype._connect = function () {
	var self = this

	if (self._destroyed)
		return

	self._response = new IncomingMessage(self._xhr, self._fetchResponse, self._mode, self._resetTimers.bind(self))
	self._response.on('error', function(err) {
		self.emit('error', err)
	})

	self.emit('response', self._response)
}

ClientRequest.prototype._write = function (chunk, encoding, cb) {
	var self = this

	self._body.push(chunk)
	cb()
}

ClientRequest.prototype._resetTimers = function (done) {
	var self = this

	global.clearTimeout(self._socketTimer)
	self._socketTimer = null

	if (done) {
		global.clearTimeout(self._fetchTimer)
		self._fetchTimer = null
	} else if (self._socketTimeout) {
		self._socketTimer = global.setTimeout(function () {
			self.emit('timeout')
		}, self._socketTimeout)
	}
}

ClientRequest.prototype.abort = ClientRequest.prototype.destroy = function (err) {
	var self = this
	self._destroyed = true
	self._resetTimers(true)
	if (self._response)
		self._response._destroyed = true
	if (self._xhr)
		self._xhr.abort()
	else if (self._fetchAbortController)
		self._fetchAbortController.abort()

	if (err)
		self.emit('error', err)
}

ClientRequest.prototype.end = function (data, encoding, cb) {
	var self = this
	if (typeof data === 'function') {
		cb = data
		data = undefined
	}

	stream.Writable.prototype.end.call(self, data, encoding, cb)
}

ClientRequest.prototype.setTimeout = function (timeout, cb) {
	var self = this

	if (cb)
		self.once('timeout', cb)

	self._socketTimeout = timeout
	self._resetTimers(false)
}

ClientRequest.prototype.flushHeaders = function () {}
ClientRequest.prototype.setNoDelay = function () {}
ClientRequest.prototype.setSocketKeepAlive = function () {}

// Taken from http://www.w3.org/TR/XMLHttpRequest/#the-setrequestheader%28%29-method
var unsafeHeaders = [
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'cookie',
	'cookie2',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via'
]

}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"./capability":28,"./response":30,"_process":21,"buffer":15,"inherits":20,"readable-stream":45}],30:[function(require,module,exports){
(function (process,global,Buffer){(function (){
var capability = require('./capability')
var inherits = require('inherits')
var stream = require('readable-stream')

var rStates = exports.readyStates = {
	UNSENT: 0,
	OPENED: 1,
	HEADERS_RECEIVED: 2,
	LOADING: 3,
	DONE: 4
}

var IncomingMessage = exports.IncomingMessage = function (xhr, response, mode, resetTimers) {
	var self = this
	stream.Readable.call(self)

	self._mode = mode
	self.headers = {}
	self.rawHeaders = []
	self.trailers = {}
	self.rawTrailers = []

	// Fake the 'close' event, but only once 'end' fires
	self.on('end', function () {
		// The nextTick is necessary to prevent the 'request' module from causing an infinite loop
		process.nextTick(function () {
			self.emit('close')
		})
	})

	if (mode === 'fetch') {
		self._fetchResponse = response

		self.url = response.url
		self.statusCode = response.status
		self.statusMessage = response.statusText
		
		response.headers.forEach(function (header, key){
			self.headers[key.toLowerCase()] = header
			self.rawHeaders.push(key, header)
		})

		if (capability.writableStream) {
			var writable = new WritableStream({
				write: function (chunk) {
					resetTimers(false)
					return new Promise(function (resolve, reject) {
						if (self._destroyed) {
							reject()
						} else if(self.push(Buffer.from(chunk))) {
							resolve()
						} else {
							self._resumeFetch = resolve
						}
					})
				},
				close: function () {
					resetTimers(true)
					if (!self._destroyed)
						self.push(null)
				},
				abort: function (err) {
					resetTimers(true)
					if (!self._destroyed)
						self.emit('error', err)
				}
			})

			try {
				response.body.pipeTo(writable).catch(function (err) {
					resetTimers(true)
					if (!self._destroyed)
						self.emit('error', err)
				})
				return
			} catch (e) {} // pipeTo method isn't defined. Can't find a better way to feature test this
		}
		// fallback for when writableStream or pipeTo aren't available
		var reader = response.body.getReader()
		function read () {
			reader.read().then(function (result) {
				if (self._destroyed)
					return
				resetTimers(result.done)
				if (result.done) {
					self.push(null)
					return
				}
				self.push(Buffer.from(result.value))
				read()
			}).catch(function (err) {
				resetTimers(true)
				if (!self._destroyed)
					self.emit('error', err)
			})
		}
		read()
	} else {
		self._xhr = xhr
		self._pos = 0

		self.url = xhr.responseURL
		self.statusCode = xhr.status
		self.statusMessage = xhr.statusText
		var headers = xhr.getAllResponseHeaders().split(/\r?\n/)
		headers.forEach(function (header) {
			var matches = header.match(/^([^:]+):\s*(.*)/)
			if (matches) {
				var key = matches[1].toLowerCase()
				if (key === 'set-cookie') {
					if (self.headers[key] === undefined) {
						self.headers[key] = []
					}
					self.headers[key].push(matches[2])
				} else if (self.headers[key] !== undefined) {
					self.headers[key] += ', ' + matches[2]
				} else {
					self.headers[key] = matches[2]
				}
				self.rawHeaders.push(matches[1], matches[2])
			}
		})

		self._charset = 'x-user-defined'
		if (!capability.overrideMimeType) {
			var mimeType = self.rawHeaders['mime-type']
			if (mimeType) {
				var charsetMatch = mimeType.match(/;\s*charset=([^;])(;|$)/)
				if (charsetMatch) {
					self._charset = charsetMatch[1].toLowerCase()
				}
			}
			if (!self._charset)
				self._charset = 'utf-8' // best guess
		}
	}
}

inherits(IncomingMessage, stream.Readable)

IncomingMessage.prototype._read = function () {
	var self = this

	var resolve = self._resumeFetch
	if (resolve) {
		self._resumeFetch = null
		resolve()
	}
}

IncomingMessage.prototype._onXHRProgress = function (resetTimers) {
	var self = this

	var xhr = self._xhr

	var response = null
	switch (self._mode) {
		case 'text':
			response = xhr.responseText
			if (response.length > self._pos) {
				var newData = response.substr(self._pos)
				if (self._charset === 'x-user-defined') {
					var buffer = Buffer.alloc(newData.length)
					for (var i = 0; i < newData.length; i++)
						buffer[i] = newData.charCodeAt(i) & 0xff

					self.push(buffer)
				} else {
					self.push(newData, self._charset)
				}
				self._pos = response.length
			}
			break
		case 'arraybuffer':
			if (xhr.readyState !== rStates.DONE || !xhr.response)
				break
			response = xhr.response
			self.push(Buffer.from(new Uint8Array(response)))
			break
		case 'moz-chunked-arraybuffer': // take whole
			response = xhr.response
			if (xhr.readyState !== rStates.LOADING || !response)
				break
			self.push(Buffer.from(new Uint8Array(response)))
			break
		case 'ms-stream':
			response = xhr.response
			if (xhr.readyState !== rStates.LOADING)
				break
			var reader = new global.MSStreamReader()
			reader.onprogress = function () {
				if (reader.result.byteLength > self._pos) {
					self.push(Buffer.from(new Uint8Array(reader.result.slice(self._pos))))
					self._pos = reader.result.byteLength
				}
			}
			reader.onload = function () {
				resetTimers(true)
				self.push(null)
			}
			// reader.onerror = ??? // TODO: this
			reader.readAsArrayBuffer(response)
			break
	}

	// The ms-stream case handles end separately in reader.onload()
	if (self._xhr.readyState === rStates.DONE && self._mode !== 'ms-stream') {
		resetTimers(true)
		self.push(null)
	}
}

}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"./capability":28,"_process":21,"buffer":15,"inherits":20,"readable-stream":45}],31:[function(require,module,exports){
'use strict';

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

var codes = {};

function createErrorType(code, message, Base) {
  if (!Base) {
    Base = Error;
  }

  function getMessage(arg1, arg2, arg3) {
    if (typeof message === 'string') {
      return message;
    } else {
      return message(arg1, arg2, arg3);
    }
  }

  var NodeError =
  /*#__PURE__*/
  function (_Base) {
    _inheritsLoose(NodeError, _Base);

    function NodeError(arg1, arg2, arg3) {
      return _Base.call(this, getMessage(arg1, arg2, arg3)) || this;
    }

    return NodeError;
  }(Base);

  NodeError.prototype.name = Base.name;
  NodeError.prototype.code = code;
  codes[code] = NodeError;
} // https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js


function oneOf(expected, thing) {
  if (Array.isArray(expected)) {
    var len = expected.length;
    expected = expected.map(function (i) {
      return String(i);
    });

    if (len > 2) {
      return "one of ".concat(thing, " ").concat(expected.slice(0, len - 1).join(', '), ", or ") + expected[len - 1];
    } else if (len === 2) {
      return "one of ".concat(thing, " ").concat(expected[0], " or ").concat(expected[1]);
    } else {
      return "of ".concat(thing, " ").concat(expected[0]);
    }
  } else {
    return "of ".concat(thing, " ").concat(String(expected));
  }
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith


function startsWith(str, search, pos) {
  return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith


function endsWith(str, search, this_len) {
  if (this_len === undefined || this_len > str.length) {
    this_len = str.length;
  }

  return str.substring(this_len - search.length, this_len) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes


function includes(str, search, start) {
  if (typeof start !== 'number') {
    start = 0;
  }

  if (start + search.length > str.length) {
    return false;
  } else {
    return str.indexOf(search, start) !== -1;
  }
}

createErrorType('ERR_INVALID_OPT_VALUE', function (name, value) {
  return 'The value "' + value + '" is invalid for option "' + name + '"';
}, TypeError);
createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
  // determiner: 'must be' or 'must not be'
  var determiner;

  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
    determiner = 'must not be';
    expected = expected.replace(/^not /, '');
  } else {
    determiner = 'must be';
  }

  var msg;

  if (endsWith(name, ' argument')) {
    // For cases like 'first argument'
    msg = "The ".concat(name, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  } else {
    var type = includes(name, '.') ? 'property' : 'argument';
    msg = "The \"".concat(name, "\" ").concat(type, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  }

  msg += ". Received type ".concat(typeof actual);
  return msg;
}, TypeError);
createErrorType('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
createErrorType('ERR_METHOD_NOT_IMPLEMENTED', function (name) {
  return 'The ' + name + ' method is not implemented';
});
createErrorType('ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
createErrorType('ERR_STREAM_DESTROYED', function (name) {
  return 'Cannot call ' + name + ' after a stream was destroyed';
});
createErrorType('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
createErrorType('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
createErrorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');
createErrorType('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
createErrorType('ERR_UNKNOWN_ENCODING', function (arg) {
  return 'Unknown encoding: ' + arg;
}, TypeError);
createErrorType('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');
module.exports.codes = codes;

},{}],32:[function(require,module,exports){
(function (process){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.
'use strict';
/*<replacement>*/

var objectKeys = Object.keys || function (obj) {
  var keys = [];

  for (var key in obj) {
    keys.push(key);
  }

  return keys;
};
/*</replacement>*/


module.exports = Duplex;

var Readable = require('./_stream_readable');

var Writable = require('./_stream_writable');

require('inherits')(Duplex, Readable);

{
  // Allow the keys array to be GC'ed.
  var keys = objectKeys(Writable.prototype);

  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);
  Readable.call(this, options);
  Writable.call(this, options);
  this.allowHalfOpen = true;

  if (options) {
    if (options.readable === false) this.readable = false;
    if (options.writable === false) this.writable = false;

    if (options.allowHalfOpen === false) {
      this.allowHalfOpen = false;
      this.once('end', onend);
    }
  }
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});
Object.defineProperty(Duplex.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});
Object.defineProperty(Duplex.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
}); // the no-half-open enforcer

function onend() {
  // If the writable side ended, then we're ok.
  if (this._writableState.ended) return; // no more data can be written.
  // But allow more writes to happen in this tick.

  process.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }

    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});
}).call(this)}).call(this,require('_process'))
},{"./_stream_readable":34,"./_stream_writable":36,"_process":21,"inherits":20}],33:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.
'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

require('inherits')(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);
  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":35,"inherits":20}],34:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
'use strict';

module.exports = Readable;
/*<replacement>*/

var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;
/*<replacement>*/

var EE = require('events').EventEmitter;

var EElistenerCount = function EElistenerCount(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/


var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}
/*<replacement>*/


var debugUtil = require('util');

var debug;

if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function debug() {};
}
/*</replacement>*/


var BufferList = require('./internal/streams/buffer_list');

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_STREAM_PUSH_AFTER_EOF = _require$codes.ERR_STREAM_PUSH_AFTER_EOF,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes.ERR_STREAM_UNSHIFT_AFTER_END_EVENT; // Lazy loaded to improve the startup performance.


var StringDecoder;
var createReadableStreamAsyncIterator;
var from;

require('inherits')(Readable, Stream);

var errorOrDestroy = destroyImpl.errorOrDestroy;
var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn); // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.

  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode; // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"

  this.highWaterMark = getHighWaterMark(this, options, 'readableHighWaterMark', isDuplex); // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()

  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false; // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.

  this.sync = true; // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.

  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;
  this.paused = true; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'end' (and potentially 'finish')

  this.autoDestroy = !!options.autoDestroy; // has it been destroyed

  this.destroyed = false; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // the number of writers that are awaiting a drain event in .pipe()s

  this.awaitDrain = 0; // if true, a maybeReadMore has been scheduled

  this.readingMore = false;
  this.decoder = null;
  this.encoding = null;

  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');
  if (!(this instanceof Readable)) return new Readable(options); // Checking for a Stream.Duplex instance is faster here instead of inside
  // the ReadableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  this._readableState = new ReadableState(options, this, isDuplex); // legacy

  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined) {
      return false;
    }

    return this._readableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
  }
});
Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;

Readable.prototype._destroy = function (err, cb) {
  cb(err);
}; // Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.


Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;

      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }

      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
}; // Unshift should *always* be something directly out of read()


Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  debug('readableAddChunk', chunk);
  var state = stream._readableState;

  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);

    if (er) {
      errorOrDestroy(stream, er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
      } else if (state.destroyed) {
        return false;
      } else {
        state.reading = false;

        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
      maybeReadMore(stream, state);
    }
  } // We can push more data if we are below the highWaterMark.
  // Also, if we have no data yet, we can stand some more bytes.
  // This is to work around cases where hwm=0, such as the repl.


  return !state.ended && (state.length < state.highWaterMark || state.length === 0);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    state.awaitDrain = 0;
    stream.emit('data', chunk);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);
    if (state.needReadable) emitReadable(stream);
  }

  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;

  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
  }

  return er;
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
}; // backwards compatibility.


Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  var decoder = new StringDecoder(enc);
  this._readableState.decoder = decoder; // If setEncoding(null), decoder.encoding equals utf8

  this._readableState.encoding = this._readableState.decoder.encoding; // Iterate over current buffer to convert already stored Buffers:

  var p = this._readableState.buffer.head;
  var content = '';

  while (p !== null) {
    content += decoder.write(p.data);
    p = p.next;
  }

  this._readableState.buffer.clear();

  if (content !== '') this._readableState.buffer.push(content);
  this._readableState.length = content.length;
  return this;
}; // Don't raise the hwm > 1GB


var MAX_HWM = 0x40000000;

function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    // TODO(ronag): Throw ERR_VALUE_OUT_OF_RANGE.
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }

  return n;
} // This function is designed to be inlinable, so please take care when making
// changes to the function body.


function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;

  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  } // If we're asking for more than the current hwm, then raise the hwm.


  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n; // Don't have enough

  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }

  return state.length;
} // you can override either this method, or the async _read(n) below.


Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;
  if (n !== 0) state.emittedReadable = false; // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.

  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state); // if we've ended, and we're now clear, then finish it up.

  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  } // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.
  // if we need a readable event, then we need to do some reading.


  var doRead = state.needReadable;
  debug('need readable', doRead); // if we currently have less than the highWaterMark, then also read some

  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  } // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.


  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true; // if the length is currently zero, then we *need* a readable event.

    if (state.length === 0) state.needReadable = true; // call internal read method

    this._read(state.highWaterMark);

    state.sync = false; // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.

    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = state.length <= state.highWaterMark;
    n = 0;
  } else {
    state.length -= n;
    state.awaitDrain = 0;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true; // If we tried to read() past the EOF, then emit end on the next tick.

    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);
  return ret;
};

function onEofChunk(stream, state) {
  debug('onEofChunk');
  if (state.ended) return;

  if (state.decoder) {
    var chunk = state.decoder.end();

    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }

  state.ended = true;

  if (state.sync) {
    // if we are sync, wait until next tick to emit the data.
    // Otherwise we risk emitting data in the flow()
    // the readable code triggers during a read() call
    emitReadable(stream);
  } else {
    // emit 'readable' now to make sure it gets picked up.
    state.needReadable = false;

    if (!state.emittedReadable) {
      state.emittedReadable = true;
      emitReadable_(stream);
    }
  }
} // Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.


function emitReadable(stream) {
  var state = stream._readableState;
  debug('emitReadable', state.needReadable, state.emittedReadable);
  state.needReadable = false;

  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    process.nextTick(emitReadable_, stream);
  }
}

function emitReadable_(stream) {
  var state = stream._readableState;
  debug('emitReadable_', state.destroyed, state.length, state.ended);

  if (!state.destroyed && (state.length || state.ended)) {
    stream.emit('readable');
    state.emittedReadable = false;
  } // The stream needs another readable event if
  // 1. It is not flowing, as the flow mechanism will take
  //    care of it.
  // 2. It is not ended.
  // 3. It is below the highWaterMark, so we can schedule
  //    another readable later.


  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
  flow(stream);
} // at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.


function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  // Attempt to read more data if we should.
  //
  // The conditions for reading more data are (one of):
  // - Not enough data buffered (state.length < state.highWaterMark). The loop
  //   is responsible for filling the buffer with enough data if such data
  //   is available. If highWaterMark is 0 and we are not in the flowing mode
  //   we should _not_ attempt to buffer any extra data. We'll get more data
  //   when the stream consumer calls read() instead.
  // - No data in the buffer, and the stream is in flowing mode. In this mode
  //   the loop below is responsible for ensuring read() is called. Failing to
  //   call read here would abort the flow and there's no other mechanism for
  //   continuing the flow if the stream consumer has just subscribed to the
  //   'data' event.
  //
  // In addition to the above conditions to keep reading data, the following
  // conditions prevent the data from being read:
  // - The stream has ended (state.ended).
  // - There is already a pending 'read' operation (state.reading). This is a
  //   case where the the stream has called the implementation defined _read()
  //   method, but they are processing the call asynchronously and have _not_
  //   called push() with new data. In this case we skip performing more
  //   read()s. The execution ends in this method again after the _read() ends
  //   up calling push() with more data.
  while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
    var len = state.length;
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length) // didn't get any data, stop spinning.
      break;
  }

  state.readingMore = false;
} // abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.


Readable.prototype._read = function (n) {
  errorOrDestroy(this, new ERR_METHOD_NOT_IMPLEMENTED('_read()'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;

    case 1:
      state.pipes = [state.pipes, dest];
      break;

    default:
      state.pipes.push(dest);
      break;
  }

  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);
  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) process.nextTick(endFn);else src.once('end', endFn);
  dest.on('unpipe', onunpipe);

  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');

    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  } // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.


  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);
  var cleanedUp = false;

  function cleanup() {
    debug('cleanup'); // cleanup event handlers once the pipe is broken

    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);
    cleanedUp = true; // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.

    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  src.on('data', ondata);

  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    debug('dest.write', ret);

    if (ret === false) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', state.awaitDrain);
        state.awaitDrain++;
      }

      src.pause();
    }
  } // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.


  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) errorOrDestroy(dest, er);
  } // Make sure our error handler is attached before userland ones.


  prependListener(dest, 'error', onerror); // Both close and finish should trigger unpipe, but only once.

  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }

  dest.once('close', onclose);

  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }

  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  } // tell the dest that it's being piped to


  dest.emit('pipe', src); // start the flow if it hasn't been started already.

  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function pipeOnDrainFunctionResult() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;

    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = {
    hasUnpiped: false
  }; // if we're not piping anywhere, then do nothing.

  if (state.pipesCount === 0) return this; // just one destination.  most common case.

  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;
    if (!dest) dest = state.pipes; // got a match.

    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  } // slow case. multiple pipe destinations.


  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, {
        hasUnpiped: false
      });
    }

    return this;
  } // try to find the right one.


  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;
  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];
  dest.emit('unpipe', this, unpipeInfo);
  return this;
}; // set up data events if they are asked for
// Ensure readable listeners eventually get something


Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);
  var state = this._readableState;

  if (ev === 'data') {
    // update readableListening so that resume() may be a no-op
    // a few lines down. This is needed to support once('readable').
    state.readableListening = this.listenerCount('readable') > 0; // Try start flowing on next tick if stream isn't explicitly paused

    if (state.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.flowing = false;
      state.emittedReadable = false;
      debug('on readable', state.length, state.reading);

      if (state.length) {
        emitReadable(this);
      } else if (!state.reading) {
        process.nextTick(nReadingNextTick, this);
      }
    }
  }

  return res;
};

Readable.prototype.addListener = Readable.prototype.on;

Readable.prototype.removeListener = function (ev, fn) {
  var res = Stream.prototype.removeListener.call(this, ev, fn);

  if (ev === 'readable') {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

Readable.prototype.removeAllListeners = function (ev) {
  var res = Stream.prototype.removeAllListeners.apply(this, arguments);

  if (ev === 'readable' || ev === undefined) {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

function updateReadableListening(self) {
  var state = self._readableState;
  state.readableListening = self.listenerCount('readable') > 0;

  if (state.resumeScheduled && !state.paused) {
    // flowing needs to be set to true now, otherwise
    // the upcoming resume will not flow.
    state.flowing = true; // crude way to check if we should resume
  } else if (self.listenerCount('data') > 0) {
    self.resume();
  }
}

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
} // pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.


Readable.prototype.resume = function () {
  var state = this._readableState;

  if (!state.flowing) {
    debug('resume'); // we flow only if there is no one listening
    // for readable, but we still have to call
    // resume()

    state.flowing = !state.readableListening;
    resume(this, state);
  }

  state.paused = false;
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  debug('resume', state.reading);

  if (!state.reading) {
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);

  if (this._readableState.flowing !== false) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }

  this._readableState.paused = true;
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);

  while (state.flowing && stream.read() !== null) {
    ;
  }
} // wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.


Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;
  stream.on('end', function () {
    debug('wrapped end');

    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });
  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk); // don't skip over falsy values in objectMode

    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);

    if (!ret) {
      paused = true;
      stream.pause();
    }
  }); // proxy all the other methods.
  // important when wrapping filters and duplexes.

  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function methodWrap(method) {
        return function methodWrapReturnFunction() {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  } // proxy certain important events.


  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  } // when we try to consume some more bytes, simply unpause the
  // underlying stream.


  this._read = function (n) {
    debug('wrapped _read', n);

    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

if (typeof Symbol === 'function') {
  Readable.prototype[Symbol.asyncIterator] = function () {
    if (createReadableStreamAsyncIterator === undefined) {
      createReadableStreamAsyncIterator = require('./internal/streams/async_iterator');
    }

    return createReadableStreamAsyncIterator(this);
  };
}

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.highWaterMark;
  }
});
Object.defineProperty(Readable.prototype, 'readableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState && this._readableState.buffer;
  }
});
Object.defineProperty(Readable.prototype, 'readableFlowing', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.flowing;
  },
  set: function set(state) {
    if (this._readableState) {
      this._readableState.flowing = state;
    }
  }
}); // exposed for testing purposes only.

Readable._fromList = fromList;
Object.defineProperty(Readable.prototype, 'readableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.length;
  }
}); // Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.

function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;
  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.first();else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = state.buffer.consume(n, state.decoder);
  }
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;
  debug('endReadable', state.endEmitted);

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  debug('endReadableNT', state.endEmitted, state.length); // Check that we didn't get one last unshift.

  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');

    if (state.autoDestroy) {
      // In case of duplex streams we need a way to detect
      // if the writable side is ready for autoDestroy as well
      var wState = stream._writableState;

      if (!wState || wState.autoDestroy && wState.finished) {
        stream.destroy();
      }
    }
  }
}

if (typeof Symbol === 'function') {
  Readable.from = function (iterable, opts) {
    if (from === undefined) {
      from = require('./internal/streams/from');
    }

    return from(Readable, iterable, opts);
  };
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }

  return -1;
}
}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":31,"./_stream_duplex":32,"./internal/streams/async_iterator":37,"./internal/streams/buffer_list":38,"./internal/streams/destroy":39,"./internal/streams/from":41,"./internal/streams/state":43,"./internal/streams/stream":44,"_process":21,"buffer":15,"events":17,"inherits":20,"string_decoder/":46,"util":14}],35:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.
'use strict';

module.exports = Transform;

var _require$codes = require('../errors').codes,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING,
    ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0;

var Duplex = require('./_stream_duplex');

require('inherits')(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;
  var cb = ts.writecb;

  if (cb === null) {
    return this.emit('error', new ERR_MULTIPLE_CALLBACK());
  }

  ts.writechunk = null;
  ts.writecb = null;
  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);
  cb(er);
  var rs = this._readableState;
  rs.reading = false;

  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);
  Duplex.call(this, options);
  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  }; // start out asking for a readable event once data is transformed.

  this._readableState.needReadable = true; // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.

  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;
    if (typeof options.flush === 'function') this._flush = options.flush;
  } // When the writable side finishes, then flush out anything remaining.


  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
}; // This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.


Transform.prototype._transform = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_transform()'));
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;

  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
}; // Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.


Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && !ts.transforming) {
    ts.transforming = true;

    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);
  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data); // TODO(BridgeAR): Write a test for these two error cases
  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided

  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
  return stream.push(null);
}
},{"../errors":31,"./_stream_duplex":32,"inherits":20}],36:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.
'use strict';

module.exports = Writable;
/* <replacement> */

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
} // It seems a linked list but it is not
// there will be only 2 of these for each stream


function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/


var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;
/*<replacement>*/

var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/

var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED,
    ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES,
    ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END,
    ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;

var errorOrDestroy = destroyImpl.errorOrDestroy;

require('inherits')(Writable, Stream);

function nop() {}

function WritableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream,
  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag to indicate whether or not this stream
  // contains buffers or objects.

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode; // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()

  this.highWaterMark = getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex); // if _final has been called

  this.finalCalled = false; // drain event flag.

  this.needDrain = false; // at the start of calling end()

  this.ending = false; // when end() has been called, and returned

  this.ended = false; // when 'finish' is emitted

  this.finished = false; // has it been destroyed

  this.destroyed = false; // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.

  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.

  this.length = 0; // a flag to see when we're in the middle of a write.

  this.writing = false; // when true all writes will be buffered until .uncork() call

  this.corked = 0; // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.

  this.sync = true; // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.

  this.bufferProcessing = false; // the callback that's passed to _write(chunk,cb)

  this.onwrite = function (er) {
    onwrite(stream, er);
  }; // the callback that the user supplies to write(chunk,encoding,cb)


  this.writecb = null; // the amount that is being written when _write is called.

  this.writelen = 0;
  this.bufferedRequest = null;
  this.lastBufferedRequest = null; // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted

  this.pendingcb = 0; // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams

  this.prefinished = false; // True if the error was already emitted and should not be thrown again

  this.errorEmitted = false; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'finish' (and potentially 'end')

  this.autoDestroy = !!options.autoDestroy; // count buffered requests

  this.bufferedRequestCount = 0; // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two

  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];

  while (current) {
    out.push(current);
    current = current.next;
  }

  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function writableStateBufferGetter() {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})(); // Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.


var realHasInstance;

if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function value(object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;
      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function realHasInstance(object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex'); // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.
  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  // Checking for a Stream.Duplex instance is faster here instead of inside
  // the WritableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  if (!isDuplex && !realHasInstance.call(Writable, this)) return new Writable(options);
  this._writableState = new WritableState(options, this, isDuplex); // legacy.

  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
} // Otherwise people can pipe Writable streams, which is just wrong.


Writable.prototype.pipe = function () {
  errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
};

function writeAfterEnd(stream, cb) {
  var er = new ERR_STREAM_WRITE_AFTER_END(); // TODO: defer error events consistently everywhere, not just the cb

  errorOrDestroy(stream, er);
  process.nextTick(cb, er);
} // Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.


function validChunk(stream, state, chunk, cb) {
  var er;

  if (chunk === null) {
    er = new ERR_STREAM_NULL_VALUES();
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
  }

  if (er) {
    errorOrDestroy(stream, er);
    process.nextTick(cb, er);
    return false;
  }

  return true;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;
  if (typeof cb !== 'function') cb = nop;
  if (state.ending) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }
  return ret;
};

Writable.prototype.cork = function () {
  this._writableState.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;
    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

Object.defineProperty(Writable.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }

  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
}); // if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.

function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);

    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }

  var len = state.objectMode ? 1 : chunk.length;
  state.length += len;
  var ret = state.length < state.highWaterMark; // we must ensure that previous needDrain will not be reset to false.

  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };

    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }

    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));else if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    process.nextTick(cb, er); // this can emit finish, and it will always happen
    // after error

    process.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    errorOrDestroy(stream, er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    errorOrDestroy(stream, er); // this can emit finish, but finish must
    // always follow error

    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;
  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK();
  onwriteStateUpdate(state);
  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state) || stream.destroyed;

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(afterWrite, stream, state, finished, cb);
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
} // Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.


function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
} // if there's something in the buffer waiting, then process it


function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;
    var count = 0;
    var allBuffers = true;

    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }

    buffer.allBuffers = allBuffers;
    doWrite(stream, state, true, state.length, buffer, '', holder.finish); // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite

    state.pendingcb++;
    state.lastBufferedRequest = null;

    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }

    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;
      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--; // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.

      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding); // .end() fully uncorks

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  } // ignore unnecessary end() calls.


  if (!state.ending) endWritable(this, state, cb);
  return this;
};

Object.defineProperty(Writable.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
});

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;

    if (err) {
      errorOrDestroy(stream, err);
    }

    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}

function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++;
      state.finalCalled = true;
      process.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);

  if (need) {
    prefinish(stream, state);

    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');

      if (state.autoDestroy) {
        // In case of duplex streams we need a way to detect
        // if the readable side is ready for autoDestroy as well
        var rState = stream._readableState;

        if (!rState || rState.autoDestroy && rState.endEmitted) {
          stream.destroy();
        }
      }
    }
  }

  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);

  if (cb) {
    if (state.finished) process.nextTick(cb);else stream.once('finish', cb);
  }

  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;

  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  } // reuse the free corkReq.


  state.corkedRequestsFree.next = corkReq;
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._writableState === undefined) {
      return false;
    }

    return this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._writableState.destroyed = value;
  }
});
Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;

Writable.prototype._destroy = function (err, cb) {
  cb(err);
};
}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":31,"./_stream_duplex":32,"./internal/streams/destroy":39,"./internal/streams/state":43,"./internal/streams/stream":44,"_process":21,"buffer":15,"inherits":20,"util-deprecate":49}],37:[function(require,module,exports){
(function (process){(function (){
'use strict';

var _Object$setPrototypeO;

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var finished = require('./end-of-stream');

var kLastResolve = Symbol('lastResolve');
var kLastReject = Symbol('lastReject');
var kError = Symbol('error');
var kEnded = Symbol('ended');
var kLastPromise = Symbol('lastPromise');
var kHandlePromise = Symbol('handlePromise');
var kStream = Symbol('stream');

function createIterResult(value, done) {
  return {
    value: value,
    done: done
  };
}

function readAndResolve(iter) {
  var resolve = iter[kLastResolve];

  if (resolve !== null) {
    var data = iter[kStream].read(); // we defer if data is null
    // we can be expecting either 'end' or
    // 'error'

    if (data !== null) {
      iter[kLastPromise] = null;
      iter[kLastResolve] = null;
      iter[kLastReject] = null;
      resolve(createIterResult(data, false));
    }
  }
}

function onReadable(iter) {
  // we wait for the next tick, because it might
  // emit an error with process.nextTick
  process.nextTick(readAndResolve, iter);
}

function wrapForNext(lastPromise, iter) {
  return function (resolve, reject) {
    lastPromise.then(function () {
      if (iter[kEnded]) {
        resolve(createIterResult(undefined, true));
        return;
      }

      iter[kHandlePromise](resolve, reject);
    }, reject);
  };
}

var AsyncIteratorPrototype = Object.getPrototypeOf(function () {});
var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
  get stream() {
    return this[kStream];
  },

  next: function next() {
    var _this = this;

    // if we have detected an error in the meanwhile
    // reject straight away
    var error = this[kError];

    if (error !== null) {
      return Promise.reject(error);
    }

    if (this[kEnded]) {
      return Promise.resolve(createIterResult(undefined, true));
    }

    if (this[kStream].destroyed) {
      // We need to defer via nextTick because if .destroy(err) is
      // called, the error will be emitted via nextTick, and
      // we cannot guarantee that there is no error lingering around
      // waiting to be emitted.
      return new Promise(function (resolve, reject) {
        process.nextTick(function () {
          if (_this[kError]) {
            reject(_this[kError]);
          } else {
            resolve(createIterResult(undefined, true));
          }
        });
      });
    } // if we have multiple next() calls
    // we will wait for the previous Promise to finish
    // this logic is optimized to support for await loops,
    // where next() is only called once at a time


    var lastPromise = this[kLastPromise];
    var promise;

    if (lastPromise) {
      promise = new Promise(wrapForNext(lastPromise, this));
    } else {
      // fast path needed to support multiple this.push()
      // without triggering the next() queue
      var data = this[kStream].read();

      if (data !== null) {
        return Promise.resolve(createIterResult(data, false));
      }

      promise = new Promise(this[kHandlePromise]);
    }

    this[kLastPromise] = promise;
    return promise;
  }
}, _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function () {
  return this;
}), _defineProperty(_Object$setPrototypeO, "return", function _return() {
  var _this2 = this;

  // destroy(err, cb) is a private API
  // we can guarantee we have that here, because we control the
  // Readable class this is attached to
  return new Promise(function (resolve, reject) {
    _this2[kStream].destroy(null, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(createIterResult(undefined, true));
    });
  });
}), _Object$setPrototypeO), AsyncIteratorPrototype);

var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator(stream) {
  var _Object$create;

  var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty(_Object$create, kStream, {
    value: stream,
    writable: true
  }), _defineProperty(_Object$create, kLastResolve, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kLastReject, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kError, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kEnded, {
    value: stream._readableState.endEmitted,
    writable: true
  }), _defineProperty(_Object$create, kHandlePromise, {
    value: function value(resolve, reject) {
      var data = iterator[kStream].read();

      if (data) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        resolve(createIterResult(data, false));
      } else {
        iterator[kLastResolve] = resolve;
        iterator[kLastReject] = reject;
      }
    },
    writable: true
  }), _Object$create));
  iterator[kLastPromise] = null;
  finished(stream, function (err) {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      var reject = iterator[kLastReject]; // reject if we are waiting for data in the Promise
      // returned by next() and store the error

      if (reject !== null) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        reject(err);
      }

      iterator[kError] = err;
      return;
    }

    var resolve = iterator[kLastResolve];

    if (resolve !== null) {
      iterator[kLastPromise] = null;
      iterator[kLastResolve] = null;
      iterator[kLastReject] = null;
      resolve(createIterResult(undefined, true));
    }

    iterator[kEnded] = true;
  });
  stream.on('readable', onReadable.bind(null, iterator));
  return iterator;
};

module.exports = createReadableStreamAsyncIterator;
}).call(this)}).call(this,require('_process'))
},{"./end-of-stream":40,"_process":21}],38:[function(require,module,exports){
'use strict';

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var _require = require('buffer'),
    Buffer = _require.Buffer;

var _require2 = require('util'),
    inspect = _require2.inspect;

var custom = inspect && inspect.custom || 'inspect';

function copyBuffer(src, target, offset) {
  Buffer.prototype.copy.call(src, target, offset);
}

module.exports =
/*#__PURE__*/
function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  _createClass(BufferList, [{
    key: "push",
    value: function push(v) {
      var entry = {
        data: v,
        next: null
      };
      if (this.length > 0) this.tail.next = entry;else this.head = entry;
      this.tail = entry;
      ++this.length;
    }
  }, {
    key: "unshift",
    value: function unshift(v) {
      var entry = {
        data: v,
        next: this.head
      };
      if (this.length === 0) this.tail = entry;
      this.head = entry;
      ++this.length;
    }
  }, {
    key: "shift",
    value: function shift() {
      if (this.length === 0) return;
      var ret = this.head.data;
      if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
      --this.length;
      return ret;
    }
  }, {
    key: "clear",
    value: function clear() {
      this.head = this.tail = null;
      this.length = 0;
    }
  }, {
    key: "join",
    value: function join(s) {
      if (this.length === 0) return '';
      var p = this.head;
      var ret = '' + p.data;

      while (p = p.next) {
        ret += s + p.data;
      }

      return ret;
    }
  }, {
    key: "concat",
    value: function concat(n) {
      if (this.length === 0) return Buffer.alloc(0);
      var ret = Buffer.allocUnsafe(n >>> 0);
      var p = this.head;
      var i = 0;

      while (p) {
        copyBuffer(p.data, ret, i);
        i += p.data.length;
        p = p.next;
      }

      return ret;
    } // Consumes a specified amount of bytes or characters from the buffered data.

  }, {
    key: "consume",
    value: function consume(n, hasStrings) {
      var ret;

      if (n < this.head.data.length) {
        // `slice` is the same for buffers and strings.
        ret = this.head.data.slice(0, n);
        this.head.data = this.head.data.slice(n);
      } else if (n === this.head.data.length) {
        // First chunk is a perfect match.
        ret = this.shift();
      } else {
        // Result spans more than one buffer.
        ret = hasStrings ? this._getString(n) : this._getBuffer(n);
      }

      return ret;
    }
  }, {
    key: "first",
    value: function first() {
      return this.head.data;
    } // Consumes a specified amount of characters from the buffered data.

  }, {
    key: "_getString",
    value: function _getString(n) {
      var p = this.head;
      var c = 1;
      var ret = p.data;
      n -= ret.length;

      while (p = p.next) {
        var str = p.data;
        var nb = n > str.length ? str.length : n;
        if (nb === str.length) ret += str;else ret += str.slice(0, n);
        n -= nb;

        if (n === 0) {
          if (nb === str.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = str.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Consumes a specified amount of bytes from the buffered data.

  }, {
    key: "_getBuffer",
    value: function _getBuffer(n) {
      var ret = Buffer.allocUnsafe(n);
      var p = this.head;
      var c = 1;
      p.data.copy(ret);
      n -= p.data.length;

      while (p = p.next) {
        var buf = p.data;
        var nb = n > buf.length ? buf.length : n;
        buf.copy(ret, ret.length - n, 0, nb);
        n -= nb;

        if (n === 0) {
          if (nb === buf.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = buf.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Make sure the linked list only shows the minimal necessary information.

  }, {
    key: custom,
    value: function value(_, options) {
      return inspect(this, _objectSpread({}, options, {
        // Only inspect one level.
        depth: 0,
        // It should not recurse.
        customInspect: false
      }));
    }
  }]);

  return BufferList;
}();
},{"buffer":15,"util":14}],39:[function(require,module,exports){
(function (process){(function (){
'use strict'; // undocumented cb() API, needed for core, not for public API

function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err) {
      if (!this._writableState) {
        process.nextTick(emitErrorNT, this, err);
      } else if (!this._writableState.errorEmitted) {
        this._writableState.errorEmitted = true;
        process.nextTick(emitErrorNT, this, err);
      }
    }

    return this;
  } // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks


  if (this._readableState) {
    this._readableState.destroyed = true;
  } // if this is a duplex stream mark the writable part as destroyed as well


  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      if (!_this._writableState) {
        process.nextTick(emitErrorAndCloseNT, _this, err);
      } else if (!_this._writableState.errorEmitted) {
        _this._writableState.errorEmitted = true;
        process.nextTick(emitErrorAndCloseNT, _this, err);
      } else {
        process.nextTick(emitCloseNT, _this);
      }
    } else if (cb) {
      process.nextTick(emitCloseNT, _this);
      cb(err);
    } else {
      process.nextTick(emitCloseNT, _this);
    }
  });

  return this;
}

function emitErrorAndCloseNT(self, err) {
  emitErrorNT(self, err);
  emitCloseNT(self);
}

function emitCloseNT(self) {
  if (self._writableState && !self._writableState.emitClose) return;
  if (self._readableState && !self._readableState.emitClose) return;
  self.emit('close');
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finalCalled = false;
    this._writableState.prefinished = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

function errorOrDestroy(stream, err) {
  // We have tests that rely on errors being emitted
  // in the same tick, so changing this is semver major.
  // For now when you opt-in to autoDestroy we allow
  // the error to be emitted nextTick. In a future
  // semver major update we should change the default to this.
  var rState = stream._readableState;
  var wState = stream._writableState;
  if (rState && rState.autoDestroy || wState && wState.autoDestroy) stream.destroy(err);else stream.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy,
  errorOrDestroy: errorOrDestroy
};
}).call(this)}).call(this,require('_process'))
},{"_process":21}],40:[function(require,module,exports){
// Ported from https://github.com/mafintosh/end-of-stream with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var ERR_STREAM_PREMATURE_CLOSE = require('../../../errors').codes.ERR_STREAM_PREMATURE_CLOSE;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    callback.apply(this, args);
  };
}

function noop() {}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function eos(stream, opts, callback) {
  if (typeof opts === 'function') return eos(stream, null, opts);
  if (!opts) opts = {};
  callback = once(callback || noop);
  var readable = opts.readable || opts.readable !== false && stream.readable;
  var writable = opts.writable || opts.writable !== false && stream.writable;

  var onlegacyfinish = function onlegacyfinish() {
    if (!stream.writable) onfinish();
  };

  var writableEnded = stream._writableState && stream._writableState.finished;

  var onfinish = function onfinish() {
    writable = false;
    writableEnded = true;
    if (!readable) callback.call(stream);
  };

  var readableEnded = stream._readableState && stream._readableState.endEmitted;

  var onend = function onend() {
    readable = false;
    readableEnded = true;
    if (!writable) callback.call(stream);
  };

  var onerror = function onerror(err) {
    callback.call(stream, err);
  };

  var onclose = function onclose() {
    var err;

    if (readable && !readableEnded) {
      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }

    if (writable && !writableEnded) {
      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }
  };

  var onrequest = function onrequest() {
    stream.req.on('finish', onfinish);
  };

  if (isRequest(stream)) {
    stream.on('complete', onfinish);
    stream.on('abort', onclose);
    if (stream.req) onrequest();else stream.on('request', onrequest);
  } else if (writable && !stream._writableState) {
    // legacy streams
    stream.on('end', onlegacyfinish);
    stream.on('close', onlegacyfinish);
  }

  stream.on('end', onend);
  stream.on('finish', onfinish);
  if (opts.error !== false) stream.on('error', onerror);
  stream.on('close', onclose);
  return function () {
    stream.removeListener('complete', onfinish);
    stream.removeListener('abort', onclose);
    stream.removeListener('request', onrequest);
    if (stream.req) stream.req.removeListener('finish', onfinish);
    stream.removeListener('end', onlegacyfinish);
    stream.removeListener('close', onlegacyfinish);
    stream.removeListener('finish', onfinish);
    stream.removeListener('end', onend);
    stream.removeListener('error', onerror);
    stream.removeListener('close', onclose);
  };
}

module.exports = eos;
},{"../../../errors":31}],41:[function(require,module,exports){
module.exports = function () {
  throw new Error('Readable.from is not available in the browser')
};

},{}],42:[function(require,module,exports){
// Ported from https://github.com/mafintosh/pump with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var eos;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    callback.apply(void 0, arguments);
  };
}

var _require$codes = require('../../../errors').codes,
    ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;

function noop(err) {
  // Rethrow the error if it exists to avoid swallowing it
  if (err) throw err;
}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function destroyer(stream, reading, writing, callback) {
  callback = once(callback);
  var closed = false;
  stream.on('close', function () {
    closed = true;
  });
  if (eos === undefined) eos = require('./end-of-stream');
  eos(stream, {
    readable: reading,
    writable: writing
  }, function (err) {
    if (err) return callback(err);
    closed = true;
    callback();
  });
  var destroyed = false;
  return function (err) {
    if (closed) return;
    if (destroyed) return;
    destroyed = true; // request.destroy just do .end - .abort is what we want

    if (isRequest(stream)) return stream.abort();
    if (typeof stream.destroy === 'function') return stream.destroy();
    callback(err || new ERR_STREAM_DESTROYED('pipe'));
  };
}

function call(fn) {
  fn();
}

function pipe(from, to) {
  return from.pipe(to);
}

function popCallback(streams) {
  if (!streams.length) return noop;
  if (typeof streams[streams.length - 1] !== 'function') return noop;
  return streams.pop();
}

function pipeline() {
  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
    streams[_key] = arguments[_key];
  }

  var callback = popCallback(streams);
  if (Array.isArray(streams[0])) streams = streams[0];

  if (streams.length < 2) {
    throw new ERR_MISSING_ARGS('streams');
  }

  var error;
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1;
    var writing = i > 0;
    return destroyer(stream, reading, writing, function (err) {
      if (!error) error = err;
      if (err) destroys.forEach(call);
      if (reading) return;
      destroys.forEach(call);
      callback(error);
    });
  });
  return streams.reduce(pipe);
}

module.exports = pipeline;
},{"../../../errors":31,"./end-of-stream":40}],43:[function(require,module,exports){
'use strict';

var ERR_INVALID_OPT_VALUE = require('../../../errors').codes.ERR_INVALID_OPT_VALUE;

function highWaterMarkFrom(options, isDuplex, duplexKey) {
  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
}

function getHighWaterMark(state, options, duplexKey, isDuplex) {
  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);

  if (hwm != null) {
    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
      var name = isDuplex ? duplexKey : 'highWaterMark';
      throw new ERR_INVALID_OPT_VALUE(name, hwm);
    }

    return Math.floor(hwm);
  } // Default value


  return state.objectMode ? 16 : 16 * 1024;
}

module.exports = {
  getHighWaterMark: getHighWaterMark
};
},{"../../../errors":31}],44:[function(require,module,exports){
module.exports = require('events').EventEmitter;

},{"events":17}],45:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');
exports.finished = require('./lib/internal/streams/end-of-stream.js');
exports.pipeline = require('./lib/internal/streams/pipeline.js');

},{"./lib/_stream_duplex.js":32,"./lib/_stream_passthrough.js":33,"./lib/_stream_readable.js":34,"./lib/_stream_transform.js":35,"./lib/_stream_writable.js":36,"./lib/internal/streams/end-of-stream.js":40,"./lib/internal/streams/pipeline.js":42}],46:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":26}],47:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":48,"punycode":22,"querystring":25}],48:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],49:[function(require,module,exports){
(function (global){(function (){

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate (fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config (name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],50:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}]},{},[1]);
