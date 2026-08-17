if (typeof process.send !== 'function') throw new Error('directory-picker worker must run with an IPC channel');

// The desktop shell already owns workspace selection. Returning its current
// working directory avoids the unstable upstream Win32 FFI picker entirely.
process.send({ kind: 'done', path: process.cwd() }, () => process.disconnect());
