// Native clients provide window too. Enable TanStack Query's client polling in Node tests.
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {} } });
