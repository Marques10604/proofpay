const { Buffer } = require('buffer');
const _isBuffer = Buffer.isBuffer;
Buffer.isBuffer = function(obj) {
  return _isBuffer(obj) || (obj instanceof Uint8Array);
};
globalThis.Buffer = Buffer;
