## Kubernetes

openHAB-cloud can be deployed on [Kubernetes](https://kubernetes.io) by using the resources YAML file that is provided through the repository. This resources file describes the openHAB-cloud components in terms of deployments and services in order to have the right pods running in the Kubernetes cluster so that they are able to communicate with each other.

### <a name="prerequisites"></a> Prerequisites

The main prerequisite for this deployment scenario is to have a working **Kubernetes cluster**. 

Please read [here](https://kubernetes.io/docs/user-journeys/users/application-developer/foundational/) for more foundational information about clusters and Kubernetes in general.
For a local deployment and development purposes, it is pretty simple to have such a cluster by using Minikube.
[Minikube](https://kubernetes.io/docs/tasks/tools/install-minikube/) which is a tool that helps you run Kubernetes locally by running a single-node Kubernetes cluster inside a VM. Please follow this [guide](https://kubernetes.io/docs/getting-started-guides/minikube/) for getting started and having Minikube up and running.

Another prerequisite is the **Kubectl** tool to interact with the Kubernetes cluster. Please follow this [guide](https://kubernetes.io/docs/tasks/tools/install-kubectl/#install-kubectl) to install and configure the kubectl command line tool.


### Deploying openHAB-cloud to the Kubernetes cluster


In order to deploy openHAB-cloud to Kubernetes, there are some steps required which will be done by the script in the repository. After having the Kubernetes cluster up and running and the kubectl command line tool in the PATH, the deployment can be done by running the following commands and script:

    cd openhab-cloud/deployment/kubernetes
    chmod +x openshift-deploy.sh
    ./openshift-deploy.sh

The script will create a new Kubernetes namespace called ``openhab-cloud``. It will also spin up all needed resources by one of the openHAB-cloud Kubernetes templates:

    openhabcloud_ephermal_k8_template.yml
   
 or
   
    openhabcloud_k8_template.yml
    

You can deploy openHAB-cloud with persistent storage (persistent volume claims) by using the template with storage resource definitions.

**Note:** The storage setup is highly depending on your deployment sizing, cluster and machines setup. This template only
contains an example of persistent storage (pvc), which you need to modify and adjust according your needs. 

Change this line in the deployment script to use the template without ephermal (correlates to --volumes emptyDir) settings:

    kubectl create -f openhabcloud_k8_template.yml --namespace $KUBERNETES_NAMESPACE


### Undeploying

There also is a script for shutting down and undeploying openHAB-cloud:

    cd openhab-cloud/deployment/kubernetes
    ./kubernetes-undeploy.sh


## Minikube

Minikube helps you to run an all-in-one Kubernetes cluster inside a VM. Follow the [Prerequisites](#prerequisites) to install Minikube and get it up and running.

Follow these steps to run openHAB-cloud on Minikube:

1. Start Minikube (make sure you have enough memory & cpu resources for your cluster)

    minikube start

2. Export Minikube docker tools

    eval $(minikube docker-env)

3. Execute the deployment script 

    cd openhab-cloud/deployment/kubernetes
    ./openshift-deploy.sh

5. Open Minikube dashboard (to see the deployed components, launch Kubernetes’ web UI in a browser)

    minikube dashboard
