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

KUBERNETES_NAMESPACE=openhab-cloud

echo UNDEPLOYING OPENHAB-CLOUD FROM KUBERNETES

# Deleting openHAB-cloud namespace and implicitly all services, deployments etc.
kubectl delete namespace $KUBERNETES_NAMESPACE

echo UNDEPLOYED OPENHAB-CLOUD FROM KUBERNETES