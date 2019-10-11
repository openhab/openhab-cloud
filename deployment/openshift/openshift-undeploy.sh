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

OPENSHIFT_PROJECT_NAME=openhab-cloud

echo UNDEPLOYING OPENHAB-CLOUD FROM OPENSHIFT

# Deleting openHAB-cloud project and implicitly all services, deployments etc.
oc delete project $OPENSHIFT_PROJECT_NAME

echo UNDEPLOYED OPENHAB-CLOUD FROM OPENSHIFT
