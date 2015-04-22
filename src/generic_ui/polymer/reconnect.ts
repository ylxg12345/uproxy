/// <reference path='./context.d.ts' />
import ui_constants = require('../../interfaces/ui');

Polymer({
  logout: function() {
    browserified_exports.ui.stopReconnect();
    browserified_exports.ui.view = ui_constants.View.SPLASH;
  },
  ready: function() {
    this.model = browserified_exports.model;
    if (browserified_exports.ui.browser == 'firefox') {
      this.$.reconnectDialog.style.width = '307px';
    }
  }
});
