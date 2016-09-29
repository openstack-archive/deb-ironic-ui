/*
 * Copyright 2015 Hewlett Packard Enterprise Development Company LP
 * Copyright 2016 Cray Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function () {
  'use strict';

  angular
      .module('horizon.dashboard.admin.ironic')
      .controller('horizon.dashboard.admin.ironic.NodeDetailsController',
          IronicNodeDetailsController);

  IronicNodeDetailsController.$inject = [
    '$scope',
    '$rootScope',
    '$location',
    'horizon.app.core.openstack-service-api.ironic',
    'horizon.dashboard.admin.ironic.events',
    'horizon.dashboard.admin.ironic.actions',
    'horizon.dashboard.admin.basePath',
    'horizon.dashboard.admin.ironic.maintenance.service',
    'horizon.dashboard.admin.ironic.validUuidPattern'
  ];

  function IronicNodeDetailsController($scope,
                                       $rootScope,
                                       $location,
                                       ironic,
                                       ironicEvents,
                                       actions,
                                       basePath,
                                       maintenanceService,
                                       validUuidPattern) {
    var ctrl = this;
    var path = basePath + 'ironic/node-details/sections/';

    ctrl.noPortsText = gettext('No network ports have been defined');

    ctrl.actions = actions;

    ctrl.sections = [
      {
        heading: gettext('Overview'),
        templateUrl: path + 'overview.html'
      },
      {
        heading: gettext('Configuration'),
        templateUrl: path + 'configuration.html'
      }
    ];

    ctrl.ports = [];
    ctrl.portsSrc = [];
    ctrl.basePath = basePath;
    ctrl.re_uuid = new RegExp(validUuidPattern);
    ctrl.isUuid = isUuid;
    ctrl.getVifPortId = getVifPortId;
    ctrl.putNodeInMaintenanceMode = putNodeInMaintenanceMode;
    ctrl.removeNodeFromMaintenanceMode = removeNodeFromMaintenanceMode;
    ctrl.createPort = createPort;
    ctrl.deletePort = deletePort;
    ctrl.deletePorts = deletePorts;

    var createPortHandler =
        $rootScope.$on(ironicEvents.CREATE_PORT_SUCCESS,
                       function() {
                         init();
                       });

    var deletePortHandler =
        $rootScope.$on(ironicEvents.DELETE_PORT_SUCCESS,
                       function() {
                         init();
                         $scope.$broadcast('hzTable:clearSelected');
                       });

    $scope.$on('$destroy', function() {
      createPortHandler();
      deletePortHandler();
    });

    init();

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.init
     * @description Initialize the controller instance based on the
     * current page url.
     *
     * @return {void}
     */
    function init() {
      // Fetch the Node ID from the URL.
      var pattern = /(.*\/admin\/ironic\/)(.+)\/(detail)?/;
      var uuid = $location.absUrl().match(pattern)[2];

      retrieveNode(uuid).then(function () {
        retrievePorts(uuid);
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.retrieveNode
     * @description Retrieve the node instance for a specified node id,
     * and store it in the controller instance.
     *
     * @param {string} uuid – Node name or UUID
     * @return {promise} promise
     */
    function retrieveNode(uuid) {
      return ironic.getNode(uuid).then(function (response) {
        ctrl.node = response.data;
        ctrl.node.id = uuid;
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.retrievePorts
     * @description Retrieve the ports associated with a specified node,
     * and store them in the controller instance.
     *
     * @param {string} nodeId – Node name or UUID
     * @return {void}
     */
    function retrievePorts(nodeId) {
      ironic.getPortsWithNode(nodeId).then(function (response) {
        ctrl.portsSrc = response.data.items;
        ctrl.portsSrc.forEach(function(port) {
          port.id = port.uuid;
        });
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.isUuid
     * @description Test whether a string is an OpenStack UUID
     *
     * @param {string} str – string
     * @return {boolean} True if the string is an OpenStack UUID,
     * otherwise false
     */
    function isUuid(str) {
      return !!str.match(ctrl.re_uuid);
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.getVifPortId
     * @description Get the vif_port_id property of a specified port
     *
     * @param {object} port – instance of port
     * @return {string} Value of vif_port_id property or
     * "" if the property does not exist
     */
    function getVifPortId(port) {
      return angular.isDefined(port.extra) &&
             angular.isDefined(port.extra.vif_port_id)
             ? port.extra.vif_port_id : "";
    }

    function putNodeInMaintenanceMode() {
      maintenanceService.putNodeInMaintenanceMode(ctrl.node);
    }

    function removeNodeFromMaintenanceMode() {
      maintenanceService.removeNodeFromMaintenanceMode(ctrl.node);
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.createPort
     * @description Initiate creation of a newtwork port for the current
     * node
     *
     * @return {void}
     */
    function createPort() {
      ctrl.actions.createPort(ctrl.node);
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.deletePort
     * @description Delete a specified port
     *
     * @param {port []} port – port to be deleted
     * @return {void}
     */
    function deletePort(port) {
      ctrl.actions.deletePort({id: port.uuid, name: port.address});
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.deletePorts
     * @description Delete a specified list of ports
     *
     * @param {port []} ports – list of ports to be deleted
     * @return {void}
     */
    function deletePorts(ports) {
      var selectedPorts = [];
      angular.forEach(ports, function(port) {
        selectedPorts.push({id: port.uuid, name: port.address});
      });
      ctrl.actions.deletePorts(selectedPorts);
    }
  }
})();
