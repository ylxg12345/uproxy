/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import metrics_module = require('./metrics');
import storage_interface = require('../interfaces/storage');

export class MockStorage implements storage_interface.Storage {
  constructor(private metricsData_ ?:any) {
  }
  public reset = () : Promise<void> => {
    return Promise.resolve<void>();
  }
  public load<T>(key :string) : Promise<T> {
    if (key == 'metrics' && this.metricsData_) {
      return Promise.resolve(this.metricsData_);
    } else {
      return Promise.reject('non-existing key');
    }
  }
  public save<T>(key :string, val :T) : Promise<T> {
    return Promise.resolve();
  }
  public keys = () : Promise<string[]> => {
    return Promise.resolve();
  }
}  // class MockStorage

describe('metrics_module.Metrics', () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('Emits report at time specified by storage', (done) => {
    var storage = new MockStorage(
        {nextSendTimestamp: Date.now() + 10, success: 0, failure: 0});
    var metrics = new metrics_module.Metrics(storage);
    metrics.on('report', (payload :any) => {
      expect(payload['success-v1']).toEqual(jasmine.any(String));
      expect(payload['failure-v1']).toEqual(jasmine.any(String));
      done();
    });
    metrics.onceLoaded_.then(() => {
      jasmine.clock().tick(10);
    });
    jasmine.clock().tick(1);  // Force metrics.onceLoaded_ to call fulfill
  });

  it('Emits report immediately if stored time has passed', (done) => {
    var storage = new MockStorage(
        {nextSendTimestamp: Date.now() - 10, success: 0, failure: 0});
    var metrics = new metrics_module.Metrics(storage);
    metrics.on('report', (payload :any) => {
      expect(payload['success-v1']).toEqual(jasmine.any(String));
      expect(payload['failure-v1']).toEqual(jasmine.any(String));
      done();
    });
    jasmine.clock().tick(1);  // Force metrics.onceLoaded_ to call fulfill
  });

  it('Emits report within MAX_TIMEOUT if no data in storage', (done) => {
    var storage = new MockStorage(null);
    var metrics = new metrics_module.Metrics(storage);
    metrics.on('report', (payload :any) => {
      expect(payload['success-v1']).toEqual(jasmine.any(String));
      expect(payload['failure-v1']).toEqual(jasmine.any(String));
      done();
    });
    metrics.onceLoaded_.then(() => {
      jasmine.clock().tick(metrics_module.Metrics.MAX_TIMEOUT);
    });
    jasmine.clock().tick(1);  // Force metrics.onceLoaded_ to call fulfill
  });

  it('Does not emit report before time specified in storage', (done) => {
    var storage = new MockStorage(
        {nextSendTimestamp: Date.now() + 10, success: 0, failure: 0});
    var metrics = new metrics_module.Metrics(storage);
    spyOn(metrics, 'emit');
    metrics.onceLoaded_.then(() => {
      // Verify that in 8 seconds metrics.emit will still not have been called.
      setTimeout(() => {
        expect(metrics.emit).not.toHaveBeenCalled();
        done();
      }, 8);
      jasmine.clock().tick(8);  // Tick clock, not as far as nextSendTimestamp
    });
    jasmine.clock().tick(1);  // Force metrics.onceLoaded_ to call fulfill
  });
});
