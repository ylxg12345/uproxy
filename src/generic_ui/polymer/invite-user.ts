/// <reference path='./context.d.ts' />
/// <reference path='../../../../third_party/polymer/polymer.d.ts' />

var ui = ui_context.ui;
var model = ui_context.model;
var core = ui_context.core;

Polymer({
  getSelectedNetworkInfo_ : function() {
    var selectedNetwork =
      model.onlineNetworks[this.$.networkSelectMenu.selectedIndex];
    return {
      name: selectedNetwork.name,
      userId: selectedNetwork.userId
    };
  },
  generateInviteUrl: function() {
    // TODO: how to get userId of logged in  user?
    return core.getInviteUrl(this.getSelectedNetworkInfo_()).then(
        (inviteUrl:string) => {
      this.inviteUrl = inviteUrl;
    });
  },
  sendToGMailFriend: function() {
    this.generateInviteUrl().then(() => {
      core.sendEmail({
        networkInfo: this.getSelectedNetworkInfo_(),
        to: this.inviteUserEmail,
        subject: 'Join me on uProxy',
        body: 'Click here to join me on uProxy' + this.inviteUrl
      });
      this.fire('open-dialog', {
        heading: 'Invitation Email sent', // TODO: translate
        message: '',  // TODO:
        buttons: [{
          text: ui.i18n_t("OK")
        }]
      });
      this.closeInviteUserPanel();
    });
  },
  sendToFacebookFriend: function() {
    this.generateInviteUrl().then(() => {
      var facebookUrl =
          'https://www.facebook.com/dialog/send?app_id=%20161927677344933&link='
          + this.inviteUrl + '&redirect_uri=https://www.uproxy.org/';
      ui.openTab(facebookUrl);
      this.fire('open-dialog', {
        heading: '', // TODO:
        message: 'Please complete invitation in Facebook',  // TODO:
        buttons: [{
          text: ui.i18n_t("OK")
        }]
      });
      this.closeInviteUserPanel();
    });
  },
  onNetworkSelect: function(e :any, details :any) {
    // TODO: does this need to be initialized?
    console.log('onNetworkSelect: ', details);
    if (details.isSelected) {
      this.selectedNetworkName = details.item.getAttribute('label');
    }
  },
  openInviteUserPanel: function() {
    // Reset selectedNetworkName in case it had been set and that network
    // is no longer online.
    // this.selectedNetworkName = model.onlineNetworks[0].name;
    this.$.networkSelectMenu.selectIndex(0);
    this.$.inviteUserPanel.open();
  },
  closeInviteUserPanel: function() {
    this.inviteUrl = '';
    this.$.inviteUserPanel.close();
  },
  showAcceptUserInvite: function() {
    this.fire('core-signal', { name: 'open-accept-user-invite-dialog' });
  },
  ready: function() {
    this.inviteUrl = '';
    this.inviteUserEmail = '';
    this.selectedNetworkName = '';
    this.model = model;
  }
});
