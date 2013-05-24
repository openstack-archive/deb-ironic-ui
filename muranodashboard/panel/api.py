# Copyright (c) 2013 Mirantis Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
# implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging

from openstack_dashboard.api.base import url_for

from muranoclient.v1.client import Client as murano_client

log = logging.getLogger(__name__)


def muranoclient(request):
    url = url_for(request, 'murano')
    log.debug('muranoclient connection created using token "%s" and url "%s"'
              % (request.user.token, url))
    return murano_client(endpoint=url, token=request.user.token.token['id'])


def environment_create(request, parameters):
    env = muranoclient(request).environments.create(parameters.get('name', ''))
    log.debug('Environment::Create {0}'.format(env))
    return env


def environment_delete(request, environment_id):
    result = muranoclient(request).environments.delete(environment_id)
    log.debug('Environment::Delete Id:{0}'.format(environment_id))
    return result


def environment_get(request, environment_id):
    env = muranoclient(request).environments.get(environment_id)
    log.debug('Environment::Get {0}'.format(env))
    return env


def environments_list(request):
    log.debug('Environment::List')
    return muranoclient(request).environments.list()


def environment_deploy(request, environment_id):
    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)
    for session in sessions:
        if session.state == 'open':
            session_id = session.id
    if not session_id:
        return "Sorry, nothing to deploy."
    log.debug('Obtained session with Id: {0}'.format(session_id))
    result = muranoclient(request).sessions.deploy(environment_id, session_id)
    log.debug('Environment with Id: {0} deployed in session '
              'with Id: {1}'.format(environment_id, session_id))
    return result


def service_create(request, environment_id, parameters):
    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)

    for s in sessions:
        if s.state == 'open':
            session_id = s.id
        else:
            muranoclient(request).sessions.delete(environment_id, s.id)

    if session_id is None:
        session_id = muranoclient(request).sessions.configure(environment_id).id

    if parameters['service_type'] == 'Active Directory':
        service = muranoclient(request)\
            .activeDirectories\
            .create(environment_id, session_id, parameters)
    else:
        service = muranoclient(request)\
            .webServers.create(environment_id, session_id, parameters)

    log.debug('Service::Create {0}'.format(service))
    return service


def get_time(obj):
    return obj.updated


def services_list(request, environment_id):
    services = []
    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)
    for s in sessions:
        session_id = s.id

    if session_id:
        services = muranoclient(request).activeDirectories.\
                            list(environment_id, session_id)
        services += muranoclient(request).webServers.\
                            list(environment_id, session_id)

        for i in range(len(services)):
            reports = muranoclient(request).sessions. \
                reports(environment_id, session_id,
                        services[i].id)

            for report in reports:
                services[i].operation = report.text

    log.debug('Service::List')
    return services


def get_active_directories(request, environment_id):
    services = []
    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)

    for s in sessions:
        session_id = s.id

    if session_id:
        services = muranoclient(request)\
                   .activeDirectories\
                   .list(environment_id, session_id)

    log.debug('Service::Active Directories::List')
    return services


def service_get(request, environment_id, service_id):
    services = services_list(request, environment_id)

    for service in services:
        if service.id == service_id:
            log.debug('Service::Get {0}'.format(service))
            return service


def get_data_center_id_for_service(request, service_id):
    environments = environments_list(request)

    for environment in environments:
        services = services_list(request, environment.id)
        for service in services:
            if service.id == service_id:
                return environment.id


def get_service_datails(request, service_id):
    environments = environments_list(request)
    services = []
    for environment in environments:
        services += services_list(request, environment.id)

    for service in services:
        if service.id == service_id:
            return service


def get_status_message_for_service(request, service_id):
    environment_id = get_data_center_id_for_service(request, service_id)
    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)

    for s in sessions:
        session_id = s.id

    if session_id:
        reports = muranoclient(request).sessions.\
                  reports(environment_id, session_id, service_id)

    result = 'Initialization.... \n'
    for report in reports:
        result += '  ' + str(report.text) + '\n'

    return result


def service_delete(request, environment_id, service_id):
    log.debug('Service::Remove EnvId: {0} '
              'SrvId: {1}'.format(environment_id, service_id))

    services = services_list(request, environment_id)

    session_id = None
    sessions = muranoclient(request).sessions.list(environment_id)
    for session in sessions:
        if session.state == 'open':
            session_id = session.id

    if session_id is None:
        raise Exception("Sorry, you can not delete this service now.")

    for service in services:
        if service.id is service_id:
            if service.type is 'Active Directory':
                muranoclient(request).activeDirectories.delete(environment_id,
                                                                session_id,
                                                                service_id)
            elif service.type is 'IIS':
                muranoclient(request).webServers.delete(environment_id,
                                                         session_id,
                                                         service_id)
