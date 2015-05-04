/// <reference path='../../../third_party/freedom-typings/anonymized-metrics.d.ts' />

import crypto = require('../../../third_party/uproxy-lib/crypto/random');
import logging = require('../../../third_party/uproxy-lib/logging/logging');
import storage = require('../interfaces/storage');
import uproxy_core_api = require('../interfaces/uproxy_core_api');

var log :logging.Log = new logging.Log('metrics');

export interface MetricsData {
  nextSendTimestamp :number;
  success           :number;
  failure           :number;
};

export class Metrics {
  public static MAX_TIMEOUT = 5 * 24 * 60 * 60 * 1000;  // 10 days in milliseconds.

  public onceLoaded_ :Promise<void>;  // Only public for tests
  private metricsProvider_ :freedom_AnonymizedMetrics;
  private data_ :MetricsData = {
    nextSendTimestamp: 0,  // Timestamp is in milliseconds.
    success: 0,
    failure: 0
  };

  constructor(private storage_ :storage.Storage) {
    var counterMetric = {
      type: 'logarithmic', base: 2, num_bloombits: 8, num_hashes: 2,
      num_cohorts: 64, prob_p: 0.5, prob_q: 0.75, prob_f: 0.5,
      flag_oneprr: true
    };
    this.metricsProvider_ = freedom['metrics']({
      name: 'uProxyMetrics',
      definition: {'success-v1': counterMetric, 'failure-v1': counterMetric}
    });

    this.onceLoaded_ = this.storage_.load('metrics').then(
        (storedData :MetricsData) => {
      log.info('Loaded metrics from storage', storedData);
      this.data_.success = storedData.success;
      this.data_.failure = storedData.failure;
      this.data_.nextSendTimestamp = storedData.nextSendTimestamp;
    }).catch((e :Error) => {
      log.info('No metrics found in storage');
      this.data_.nextSendTimestamp = Metrics.getNextSendTimestamp_();
      this.save_();
    });

    this.onceLoaded_.then(() => {
      // Once nextSendTimestamp is set (either from storage or initialized),
      // set a timeout to create metrics at that timestamp.  If the timestamp
      // has already passed (e.g. their browser was closed when the time passed)
      // this will create a report immediately.
      log.info('Creating metrics report at ' +
          new Date(this.data_.nextSendTimestamp));
      Metrics.runNowOrLater_(
          this.createReport_.bind(this), this.data_.nextSendTimestamp);
    })
  }

  public increment = (name :string) => {
    this.onceLoaded_.then(() => {
      if (name == 'success') {
        this.data_.success++;
        this.save_();
      } else if (name == 'failure') {
        this.data_.failure++;
        this.save_();
      } else {
        log.error('Unknown metric ' + name);
      }
    });
  }

  private createReport_ = () => {
    var resetStats = () => {
      this.data_.success = 0;
      this.data_.failure = 0;
      this.data_.nextSendTimestamp = Metrics.getNextSendTimestamp_();
      Metrics.runNowOrLater_(
          this.createReport_.bind(this), this.data_.nextSendTimestamp);
      this.save_();
    };

    try {
      crypto.randomUint32();
    } catch (e) {
      // crypto is not enabled, don't create a report
      resetStats();
      return;
    }

    this.onceLoaded_.then(() => {
      log.info('Creating metrics report');
      var successReport =
          this.metricsProvider_.report('success-v1', this.data_.success);
      var failureReport =
          this.metricsProvider_.report('failure-v1', this.data_.failure);
      Promise.all([successReport, failureReport]).then(() => {
        this.metricsProvider_.retrieve().then((payload :Object) => {
          this.emit('report', payload);
          resetStats();
        });
      });
    }).catch((e :Error) => {
      log.error('Error creating metrics report', e);
      resetStats();
    });
  }

  private events_ :{[name :string] :Function} = {};

  public on = (name :string, callback :Function) => {
    this.events_[name] = callback;
  }

  public emit = (name :string, ...args :Object[]) => {
    if (name in this.events_) {
      this.events_[name].apply(null, args);
    } else {
      log.error('Attempted to trigger an unknown event', name);
    }
  }

  private save_ = () => {
    this.storage_.save('metrics', this.data_).catch((e :Error) => {
      log.error('Could not save metrics to storage', e);
    });
  }

  // Invokes callback at the given time (specified in milliseconds).  If the
  // given time is in the past, invokes the callback immediately.
  private static runNowOrLater_ = (callback :Function,
                                   timestampInMs :number) => {
    var offset_ms = timestampInMs - Date.now();
    if (offset_ms <= 0) {
      callback();
    } else {
      setTimeout(callback, offset_ms);
    }
  }

  private static getNextSendTimestamp_ = () => {
    // Use Poisson distrubtion to calculate offset_ms in approx 24 hours.
    // TODO: use crypto.randomUint32 once it's available everywhere
    // var randomFloat = crypto.randomUint32() / Math.pow(2, 32);
    var randomFloat = Math.random();
    var MS_PER_DAY = 24 * 60 * 60 * 1000;
    var offset_ms = -Math.floor(Math.log(randomFloat) / (1 / MS_PER_DAY));
    var offset_ms = Math.min(offset_ms, Metrics.MAX_TIMEOUT)
    return Date.now() + offset_ms;
  }
}
