#!/usr/bin/env bash

#
# Copyright (c) 2010-2019 Contributors to the openHAB project
#
# See the NOTICE file(s) distributed with this work for additional
# information.
#
# This program and the accompanying materials are made available under the
# terms of the Eclipse Public License 2.0 which is available at
# http://www.eclipse.org/legal/epl-2.0
#
# SPDX-License-Identifier: EPL-2.0
#

# Contributors:
#    Mehmet Arziman (home-iX) - initial contribution

set -e

export OPENSHIFT_HOST=${OPENSHIFT_HOST:='localhost:8443'}
export OPENSHIFT_USER=${OPENSHIFT_USER:='admin'}
export OPENSHIFT_PASS=${OPENSHIFT_PASS:='admin'}
export OPENSHIFT_LOGIN_OPTS=${OPENSHIFT_LOGIN_OPTS:=''}
export OPENSHIFT_PROJECT_NAME=${OPENSHIFT_PROJECT_NAME:='openhab-cloud'}

### Login into OpenShift

oc login ${OPENSHIFT_HOST} --username=${OPENSHIFT_USER} --password=${OPENSHIFT_PASS} ${OPENSHIFT_LOGIN_OPTS}

### Create openHAB-cloud project

oc new-project "${OPENSHIFT_PROJECT_NAME}" --description="openHAB Cloud Service" --display-name="openHAB Cloud"

### Create openHAB-cloud from template

echo Creating openHAB-cloud from template ...

oc create -f openhabcloud_ephemeral_os_template.yml -n "${OPENSHIFT_PROJECT_NAME}"

echo Creating openHAB-cloud from template ... done!
