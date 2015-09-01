/// <reference path='../../../../third_party/polymer/polymer.d.ts' />
/// <reference path='./context.d.ts' />

import ui_constants = require('../../interfaces/ui');

var ui = ui_context.ui;
var core = ui_context.core;
var model = ui_context.model;

Polymer({
  connect: function() {
    // TODO: clean this up, make generic!
    // also fill in the name if it's already set
    if (this.networkName == 'Quiver') {
      this.fire('core-signal', {name: 'show-quiver-login'});
      return;
    }

    ui.login(this.networkName).then(() => {
      console.log('connected to ' + this.networkName);
      // Fire an update-view event, which root.ts listens for.
      this.fire('update-view', { view: ui_constants.View.ROSTER });
      ui.bringUproxyToFront();
    }).catch((e :Error) => {
      console.warn('Did not log in ', e);
    });
  },
  ready: function() {
    this.displayName = ui.getNetworkDisplayName(this.networkName);
  },
});
