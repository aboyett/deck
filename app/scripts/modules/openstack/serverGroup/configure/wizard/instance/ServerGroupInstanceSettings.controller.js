'use strict';

import {Observable, Subject} from 'rxjs';

import {IMAGE_READER} from 'core/image/image.reader';
import {V2_MODAL_WIZARD_SERVICE} from 'core/modal/wizard/v2modalWizard.service';
import {NAMING_SERVICE} from 'core/naming/naming.service';

let angular = require('angular');

module.exports = angular.module('spinnaker.serverGroup.configure.openstack.instanceSettings', [
  require('angular-ui-router'),
  require('angular-ui-bootstrap'),
  require('core/serverGroup/configure/common/basicSettingsMixin.controller.js'),
  V2_MODAL_WIZARD_SERVICE,
  IMAGE_READER,
  NAMING_SERVICE,
  require('../../../../instance/osInstanceTypeSelectField.directive.js'),
])
  .controller('openstackServerGroupInstanceSettingsCtrl', function($scope, $controller, $uibModalStack, $state,
                                                          v2modalWizardService, imageReader) {

    function ensureCommandBackingDataFilteredExists() {
        if( !$scope.command.backingData ) {
          $scope.command.backingData = { filtered: {} };
        } else if( !$scope.command.backingData.filtered ) {
          $scope.command.backingData.filtered = {};
        }
    }

    function searchImages(q) {
      ensureCommandBackingDataFilteredExists();
      $scope.command.backingData.filtered.images = [
        {
          message: '<span class="glyphicon glyphicon-spinning glyphicon-asterisk"></span> Finding results matching "' + q + '"...'
        }
      ];
      return Observable.fromPromise(
        imageReader.findImages({
          provider: $scope.command.selectedProvider,
          q: q,
          region: $scope.command.region,
          account: $scope.command.credentials
        })
      );
    }

    var imageSearchResultsStream = new Subject();

    imageSearchResultsStream
      .debounceTime(250)
      .switchMap(searchImages)
      .subscribe(function (data) {
        ensureCommandBackingDataFilteredExists();
        $scope.command.backingData.filtered.images = data;
        $scope.command.backingData.packageImages = $scope.command.backingData.filtered.images;
      });

    this.searchImages = function(q) {
      imageSearchResultsStream.next(q);
    };

    $scope.$watch('instanceSettings.$valid', function(newVal) {
      if (newVal) {
        v2modalWizardService.markClean('instance-settings');
        v2modalWizardService.markComplete('instance-settings');
      } else {
        v2modalWizardService.markIncomplete('instance-settings');
      }
    });
  });
