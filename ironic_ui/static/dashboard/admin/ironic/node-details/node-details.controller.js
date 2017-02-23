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
    'horizon.framework.widgets.toast.service',
    'horizon.app.core.openstack-service-api.ironic',
    'horizon.dashboard.admin.ironic.events',
    'horizon.dashboard.admin.ironic.actions',
    'horizon.dashboard.admin.ironic.basePath',
    'horizon.dashboard.admin.ironic.edit-node.service',
    'horizon.dashboard.admin.ironic.edit-port.service',
    'horizon.dashboard.admin.ironic.maintenance.service',
    'horizon.dashboard.admin.ironic.node-state-transition.service',
    'horizon.dashboard.admin.ironic.validUuidPattern'
  ];

  function IronicNodeDetailsController($scope,
                                       $rootScope,
                                       $location,
                                       toastService,
                                       ironic,
                                       ironicEvents,
                                       actions,
                                       basePath,
                                       editNodeService,
                                       editPortService,
                                       maintenanceService,
                                       nodeStateTransitionService,
                                       validUuidPattern) {
    var ctrl = this;
    var path = basePath + '/node-details/sections/';

    ctrl.noPortsText = gettext('No network ports have been defined');

    ctrl.actions = actions;
    ctrl.maintenanceService = maintenanceService;

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

    ctrl.node = null;
    ctrl.nodeValidation = [];
    ctrl.nodeValidationMap = {}; // Indexed by interface
    ctrl.nodeStateTransitions = [];
    ctrl.ports = [];
    ctrl.portsSrc = [];
    ctrl.basePath = basePath;
    ctrl.re_uuid = new RegExp(validUuidPattern);
    ctrl.isUuid = isUuid;
    ctrl.getVifPortId = getVifPortId;
    ctrl.editNode = editNode;
    ctrl.createPort = createPort;
    ctrl.deletePort = deletePort;
    ctrl.editPort = editPort;
    ctrl.refresh = refresh;
    ctrl.toggleConsoleMode = toggleConsoleMode;

    $scope.emptyObject = function(obj) {
      return angular.isUndefined(obj) || Object.keys(obj).length === 0;
    };

    $scope.isDefined = angular.isDefined;

    var editNodeHandler =
        $rootScope.$on(ironicEvents.EDIT_NODE_SUCCESS,
                       function() {
                         init();
                       });

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
      editNodeHandler();
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
        ctrl.nodeStateTransitions =
          nodeStateTransitionService.getTransitions(ctrl.node.provision_state);
        retrievePorts();
        retrieveBootDevice();
        validateNode();
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
      return ironic.getNode(uuid).then(function (node) {
        ctrl.node = node;
        ctrl.node.id = ctrl.node.uuid;
        ironic.nodeGetConsole(uuid).then(function(consoleData) {
          ctrl.node.console_enabled = consoleData.console_enabled;
          ctrl.node.console_info = consoleData.console_info;
        });
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.retrievePorts
     * @description Retrieve the ports associated with the current node,
     * and store them in the controller instance.
     *
     * @return {void}
     */
    function retrievePorts() {
      ironic.getPortsWithNode(ctrl.node.uuid).then(function (ports) {
        ctrl.portsSrc = ports;
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.retrieveBootDevice
     * @description Retrieve the boot device associated with the current node,
     * and store it in the controller instance.
     *
     * @return {void}
     */
    function retrieveBootDevice() {
      ironic.getBootDevice(ctrl.node.uuid).then(function (bootDevice) {
        ctrl.node.bootDevice = bootDevice;
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.validateNode
     * @description Retrieve the ports associated with the current node,
     * and store them in the controller instance.
     *
     * @return {void}
     */
    function validateNode() {
      ironic.validateNode(ctrl.node.uuid).then(function(response) {
        var nodeValidation = [];
        ctrl.nodeValidationMap = {};
        angular.forEach(response.data, function(status) {
          status.id = status.interface;
          nodeValidation.push(status);
          ctrl.nodeValidationMap[status.interface] = status;
        });
        ctrl.nodeValidation = nodeValidation;
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

    /**
     * @description: Edit the current node
     *
     * @return {void}
     */
    function editNode() {
      editNodeService.modal(ctrl.node);
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
     * @description: Edit a specified port
     *
     * @param {port} port - Port to be edited
     * @return {void}
     */
    function editPort(port) {
      editPortService.modal(port, ctrl.node).then(function() {
        ctrl.refresh();
      });
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.deletePort
     * @description Delete a list of ports
     *
     * @param {port []} ports – ports to be deleted
     * @return {void}
     */
    function deletePort(ports) {
      actions.deletePort(ports);
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.refresh
     * @description Update node information
     *
     * @return {void}
     */
    function refresh() {
      init();
    }

    /**
     * @name horizon.dashboard.admin.ironic.NodeDetailsController.toggleConsoleMode
     * @description Toggle the state of the console for the current node
     *
     * @return {void}
     */
    function toggleConsoleMode() {
      ironic.nodeSetConsoleMode(ctrl.node.uuid, !ctrl.node.console_enabled);
    }
  }
})();
