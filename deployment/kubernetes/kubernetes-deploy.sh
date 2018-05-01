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
KUBERNETES_ACCOUNT=openhabcloud


echo DEPLOYING OPENHAB-CLOUD TO KUBERNETES

# Creating the openHAB-cloud namespace

kubectl create namespace $NS

# Creating a service account in the namespace

kubectl create serviceaccount $KUBERNETES_ACCOUNT --namespace $KUBERNETES_NAMESPACE


### Create openHAB-cloud from template

echo Creating openHAB-cloud from template ...

kubectl create -f openhabcloud_ephemeral_k8_template.yml --namespace $KUBERNETES_NAMESPACE

echo Creating openHAB-cloud from template ... done!

echo DEPLOYED OPENHAB-CLOUD TO KUBERNETES
