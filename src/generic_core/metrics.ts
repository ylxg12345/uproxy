/// <reference path='../../../third_party/freedom-typings/anonymized-metrics.d.ts' />

import crypto = require('../../../third_party/uproxy-lib/crypto/random');
import logging = require('../../../third_party/uproxy-lib/logging/logging');
import storage = require('../interfaces/storage');
import ui_connector = require('./ui_connector');
import uproxy_core_api = require('../interfaces/uproxy_core_api');

var log :logging.Log = new logging.Log('metrics');

interface MetricsData {
  nextSendTimestamp :number;
  success           :number;
  failure           :number;
};

export class Metrics {
  private onceLoaded_ :Promise<void>;
  private metricsProvider_ :freedom_AnonymizedMetrics;
  private data_ :MetricsData = {
    nextSendTimestamp: 0,  // Timestamp is in milliseconds.
    success: 0,
    failure: 0
  };

  constructor(private storage_ :storage.Storage,
              private settings_ :uproxy_core_api.GlobalSettings) {
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
      // set a timeout to send metrics at that timestamp.  If the timestamp
      // has already passed (e.g. their browser was closed when the time passed)
      // this will send a report immediately.
      Metrics.runNowOrLater_(
          this.sendReport_.bind(this), this.data_.nextSendTimestamp);
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

  // Sends a rapporized report to the uProxy cloudfront site, only if the user
  // has enabled anonymous stats reporting, then resets all metrics and sets
  // a new timeout.  If the user has not enabled anonymous stats reporting,
  // we only reset all metrics and set a new timeout.
  private sendReport_ = () => {
    var resetStats = () => {
      this.data_.success = 0;
      this.data_.failure = 0;
      this.data_.nextSendTimestamp = Metrics.getNextSendTimestamp_();
      Metrics.runNowOrLater_(
          this.sendReport_.bind(this), this.data_.nextSendTimestamp);
      this.save_();
    };

    var isCryptoAvailable = true;
    try {
      crypto.randomUint32();
    } catch (e) {
      isCryptoAvailable = false;
    }

    if (this.settings_.statsReportingEnabled && isCryptoAvailable) {
      this.onceLoaded_.then(() => {
        log.info('Sending metrics report');
        var successReport =
            this.metricsProvider_.report('success-v1', this.data_.success);
        var failureReport =
            this.metricsProvider_.report('failure-v1', this.data_.failure);
        Promise.all([successReport, failureReport]).then(() => {
          this.metricsProvider_.retrieve().then((payload :Object) => {
            ui_connector.connector.update(
                uproxy_core_api.Update.POST_TO_CLOUDFRONT,
                {payload: payload, cloudfrontPath: 'submit-rappor-stats'});
            resetStats();
          }).catch((e :Error) => {
            log.error('Error in retrieving metrics', e);
            resetStats();
          });
        }).catch((e :Error) => {
          log.error('Error reporting metrics', e);
          resetStats();
        });
      });
    } else {
      log.info('Metrics not enabled, reseting');
      resetStats();
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
    return Date.now() + offset_ms;
  }
}
