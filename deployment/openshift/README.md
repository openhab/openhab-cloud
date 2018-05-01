## OpenShift

openHAB-cloud can be deployed to OpenShift, a PaaS (Platform As A Service) platform based on Kubernetes. openHAB-cloud natively supports deployments into [OpenShift Origin](https://www.openshift.org),
which is an open source community project. Origin sources, can be found [here](https://www.openshift.org/). 
The current supported version by openHAB-cloud is OpenShift Origin **3.7**.

### Setup OpenShift cluster

To run openHAB-cloud on an OpenShift you first need to
have an OpenShift cluster installed and started (required for the next steps)

If your OpenShift cluster is not running on localhost you can change the `OPENSHIFT_HOST` environment variable another IP address:

    export OPENSHIFT_HOST=192.168.64.1:8443


### Deploying openHAB-cloud to the OpenShift cluster

The next steps, after your OpenShift cluster is up, running and setup, are triggered by executing the following commands and script:

    cd openhab-cloud/deployment/kubernetes
    chmod +x openshift-deploy.sh
    ./openshift-deploy.sh

The script will login into your cluster and create a new OpenShift project for openhab-cloud. It will also spin up all needed resources by one of the openHAB-cloud OpenShift templates:

    openhabcloud_ephermal_os_template.yml
   
 or
   
    openhabcloud_os_template.yml
    
You can deploy openHAB-cloud with persistent storage by using the template with storage resource definitions.

**Note:** The storage setup is highly depending on your deployment sizing, cluster and machines setup. This template only
contains an example of persistent storage, which you need to modify and adjust according your needs. 

Change this line in the deployment script to use the template without ephermal (correlates to --volumes emptyDir) settings:

    oc create -f openhabcloud_os_template.yml -n "${OPENSHIFT_PROJECT_NAME}"

### Undeploying

There also is a script for shutting down and undeploying openHAB-cloud:

    cd openhab-cloud/deployment/openshift
    ./openshift-undeploy.sh
    
    
## Minishift

Minishift helps you to run OpenShift locally as a all-in-one OpenShift cluster inside a VM. Follow [this guide](https://docs.openshift.org/latest/minishift/getting-started/index.html) to install Minishift and get it up and running.

Follow these steps to run openHAB-cloud on Minishift:

1. Start Minishift (make sure you have enough memory & cpu resources for your cluster)

    minishift start --memory 8GB --cpus 4

2. Export Minishift docker and OpenShift tools (oc)

    eval $(minishift docker-env)
    eval $(minishift oc-env)

3. Export the address of your cluster

    export OPENSHIFT_HOST=$(minishift ip):8443

4. Setup the openHAB-cloud project and deploy openHAB-cloud by template

    cd openhab-cloud/deployment/kubernetes
    ./openshift-deploy.sh

5. Open Minishift dashboard

    ~~~bash
    minishift dashboard
    ~~~