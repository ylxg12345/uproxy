import crypto = require('../../../third_party/uproxy-lib/crypto/random');
import globals = require('./globals');
import logging = require('../../../third_party/uproxy-lib/logging/logging');
import ui_connector = require('./ui_connector');
import uproxy_core_api = require('../interfaces/uproxy_core_api');

var log :logging.Log = new logging.Log('metrics');

export class Metrics {
  private metricsProvider_ :any;  // TODO: type
  private data_ :any = {  // TODO: type
    nextSendTimestamp: 0,  // Timestamp is in milliseconds.
    success: 0,
    failure: 0
  };

  constructor(metricsFromStorage :any) {  // TODO: type
    var counterMetric = {
      type: 'logarithmic', base: 2, num_bloombits: 8, num_hashes: 2,
      num_cohorts: 64, prob_p: 0.5, prob_q: 0.75, prob_f: 0.5, flag_oneprr: true
    };
    this.metricsProvider_ = freedom['metrics']({
      name: 'uProxyMetrics',
      definition: {'success-v1': counterMetric, 'failure-v1': counterMetric}
    });

    // Initialize success and failure counters from storage if set.
    this.data_.success = metricsFromStorage.success || 0;
    this.data_.failure = metricsFromStorage.failure || 0;

    if (metricsFromStorage.nextSendTimestamp) {
      // Set up a timeout to send metrics at nextSendTimestamp.  If
      // nextSendTimestamp is in the past, this will send metrics immediately.
      this.data_.nextSendTimestamp = metricsFromStorage.nextSendTimestamp;
      this.sendMetricsAtTimestamp_(metricsFromStorage.nextSendTimestamp);
    } else {
      // No nextSendTimestamp, initialize it.
      this.updateNextSendTimestamp_();
      this.save_();
    }
  }

  private sendReport_ = () => {
    log.info('sending metrics report');
    var successReport =
        this.metricsProvider_.report('success-v1', this.data_.success);
    var failureReport =
        this.metricsProvider_.report('failure-v1', this.data_.failure);
    Promise.all([successReport, failureReport]).then(() => {
      this.metricsProvider_.retrieve().then((payload :Object) => {
        ui_connector.connector.update(
            uproxy_core_api.Update.POST_TO_CLOUDFRONT,
            {payload: payload, cloudfrontPath: 'submit-rappor-stats'});
        // Reset counters after sending report and update the nextSendTimestamp.
        this.data_.success = 0;
        this.data_.failure = 0;
        this.updateNextSendTimestamp_();
        this.save_();
      }).catch((e :Error) => {
        log.error('Error in retrieving metrics', e);
      });
    }).catch((e :Error) => {
      log.error('Error reporting metrics', e);
    });
  }

  public increment = (name :string) => {
    if (this.data_[name] === undefined) {
      throw new Error('Undefined metric ' + name);
    }
    this.data_[name]++;
    this.save_();
  }

  // Sends metrics report at the given timestamp.  If the timestamp is
  // in the past, metrics are sent immediately.
  private sendMetricsAtTimestamp_ = (timestampInMs :number) => {
    if (timestampInMs <= Date.now()) {
      // timestampInMs is in the past, send immediately.
      log.info('Metrics are overdue, sending');
      this.sendReport_();
    } else {
      log.info('Setting timeout for metrics at ' + new Date(timestampInMs));
      var offset_ms = timestampInMs - Date.now();
      setTimeout(this.sendReport_.bind(this), offset_ms);
    }
  }

  private updateNextSendTimestamp_ = () => {
    // Use Poisson distrubtion to calculate offset_ms in approx 24 hours.
    var randomFloat = crypto.randomUint32() / 4294967296;
    var MS_PER_DAY = 24 * 60 * 60 * 1000;
    var offset_ms = -Math.floor(Math.log(randomFloat) / (1 / MS_PER_DAY));
    this.data_.nextSendTimestamp = Date.now() + offset_ms;
    this.sendMetricsAtTimestamp_(this.data_.nextSendTimestamp);
  }

  private save_ = () => {
    globals.storage.save('metrics', this.data_).catch((e) => {
      log.error('Could not save metrics to storage', e);
    });
  }
}
