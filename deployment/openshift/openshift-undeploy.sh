#!/usr/bin/env bash


###############################################################################
# Copyright (c) 2018, home-iX and others.
#
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v1.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v10.html
#
# Contributors:
#    Mehmet Arziman (home-iX) - initial contribution
#
###############################################################################

set -e

OPENSHIFT_PROJECT_NAME=openhab-cloud

echo UNDEPLOYING OPENHAB-CLOUD FROM OPENSHIFT

# Deleting openHAB-cloud project and implicitly all services, deployments etc.
oc delete project $OPENSHIFT_PROJECT_NAME

echo UNDEPLOYED OPENHAB-CLOUD FROM OPENSHIFT