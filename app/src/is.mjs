// ==========================================================================
// Type checking utils tweaked from https://github.com/sampotts/plyr/blob/master/src/js/utils/is.js
// ==========================================================================

const getConstructor = input => (input !== null && typeof input !== 'undefined' ? input.constructor : null)
const instanceOf = (input, constructor) => Boolean(input && constructor && input instanceof constructor)
const isUndefined = input => typeof input === 'undefined'
const isNullOrUndefined = input => input === null || isUndefined(input)
const isObject = input => getConstructor(input) === Object
const isNumber = input => getConstructor(input) === Number && !Number.isNaN(input)
const isString = input => getConstructor(input) === String
const isBoolean = input => getConstructor(input) === Boolean
const isFunction = input => getConstructor(input) === Function
const isArray = input => Array.isArray(input)
const isWeakMap = input => instanceOf(input, WeakMap)
const isNodeList = input => instanceOf(input, window.NodeList)
const isElement = input => instanceOf(input, window.Element)
const isTextNode = input => getConstructor(input) === window.Text
const isEvent = input => instanceOf(input, window.Event)
const isKeyboardEvent = input => instanceOf(input, window.KeyboardEvent)
const isCue = input => instanceOf(input, window.TextTrackCue) || instanceOf(input, window.VTTCue)
const isTrack = input => instanceOf(input, window.TextTrack) || (!isNullOrUndefined(input) && isString(input.kind))
const isPromise = input => instanceOf(input, Promise)
const isDate = input =>  input instanceof Date && !isNaN(input);

const isEmpty = input =>
  isNullOrUndefined(input) ||
  ((isString(input) || isArray(input) || isNodeList(input)) && !input.length) ||
  (isObject(input) && !Object.keys(input).length)

const isUrl = input => {
  // Accept a URL object
  if (instanceOf(input, window.URL)) {
    return true
  }

  // Must be string from here
  if (!isString(input)) {
    return false
  }

  // Add the protocol if required
  let string = input
  if (!input.startsWith('http://') || !input.startsWith('https://')) {
    string = `http://${input}`
  }

  try {
    return !isEmpty(new window.URL(string).hostname)
  } catch (e) {
    return false
  }
}

export default {
  date: isDate,
  nullOrUndefined: isNullOrUndefined,
  object: isObject,
  number: isNumber,
  string: isString,
  boolean: isBoolean,
  function: isFunction,
  array: isArray,
  weakMap: isWeakMap,
  nodeList: isNodeList,
  element: isElement,
  textNode: isTextNode,
  event: isEvent,
  keyboardEvent: isKeyboardEvent,
  cue: isCue,
  track: isTrack,
  promise: isPromise,
  url: isUrl,
  empty: isEmpty,
  undefined: isUndefined
}