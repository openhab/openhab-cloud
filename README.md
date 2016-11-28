# openHAB Cloud

openHAB Cloud is a companion cloud service and backend for the openHAB open-source home automation software.
The openHAB Cloud backend provides secure remote access and enables openHAB users to remotely monitor,
control and steer their homes through the internet, collect device statistics of their openHABs, receive
notifications on their mobile devices or collect and visualize data etc.
The main core features of openHAB-cloud are an user-management frontend, secure remote access, remote proxy-access, device registry & management, messaging services and data management & persitence.
The openHAB Cloud also serves as core backend integration point for cloud-based features (e.g. IFTTT) and
provides an OAuth2 application enablement.


## Funtional Architecture ##



![FunctionalArchitecture_openHAB-cloud_v1.0.png](https://bitbucket.org/repo/XkeoB7/images/3807118397-FunctionalArchitecture_openHAB-cloud_v1.0.png)



## Getting started


openHAB Cloud is mainly based on the following frameworks and technologies:


* [Node.js](https://nodejs.org/en/) - Server-side Javascript-framework
* [Express.js](http://redis.io) - Web application framework for Node.js
* [Nginx](https://www.nginx.com/resources/wiki/) - Web server & reverse proxy
* [MongoDB](https://www.mongodb.com/) - NoSQL database
* [redis](http://redis.io) - Session Manager & data structure server
* [Socket.IO](http://socket.io/) - Bi-directional communication between web clients and servers


### Quick start ###

Installing openHAB Cloud on Linux (ubuntu).


First we need to make sure that the list of packages and dependencies
from all repositories are up-to-date: 

```
sudo apt-get update
sudo apt-get upgrade
sudo apt-get dist-upgrade
```

If you got asked to continue, confirm with Yes (Y).


Now you need install git and clone the openHAB Cloud repository to your
preffered directory (here: ubuntu) with the following commands:

```
sudo apt-get install git
cd /home/ubuntu/
sudo git clone https://username@github.com/openhab/openhab-cloud.git
```


Enter your password to clone the openhabcloud repro and after the completed
checkout you should have the directory in your choosen folder:

```
ls -al
total 32
drwxr-xr-x  5 ubuntu ubuntu 4096 Jun  4 17:06 .
drwxr-xr-x  3 root   root   4096 Jun  4 12:34 ..
-rw-r--r--  1 ubuntu ubuntu  220 Apr  9  2014 .bash_logout
-rw-r--r--  1 ubuntu ubuntu 3637 Apr  9  2014 .bashrc
drwx------  2 ubuntu ubuntu 4096 Jun  4 16:30 .cache
drwxr-xr-x 13 root   root   4096 Jun  4 17:06 openhabcloud
-rw-r--r--  1 ubuntu ubuntu  675 Apr  9  2014 .profile
drwx------  2 ubuntu ubuntu 4096 Jun  4 12:34 .ssh
```



To run openHAB Cloud you need to install the required software bundles/stacks.
Within the main directory "openhabcloud" you need to run

```
npm install
```

and all the module dependencies from **package.json** will be resolved and needed packages installed.



Now we need to change into the openhabcloud directory and check if node is installed:

```
cd openhabcloud/
ls -al
node --version
```


If you see the node version, we can continue to install some more node dependencies:

```
sudo npm install time q node-forge engine.io socket.io-parser has-binary-data socket.io-adapter
sudo apt-get install libkrb5-dev
sudo npm install libxmljs
```

As last step we will add some libraries needed by node to connect to mongodb:

```
sudo npm install mongoose mongoose-types has-binary-data node-stringprep
```


openHAB Cloud uses redis for session management. To learn more about redis please read  
[here](http://redis.io). To check if redis is installed correctly and running we run this command:

```
redis-cli ping
```
Redis will answer with PONG if all is fine.


openHAB Cloud uses new relic to pinpoint and monitor node.js application performance issues.
We will create a dummy newrelic agent configuration file:

```
sudo cp /home/ubuntu/openhabcloud/node_modules/newrelic/lib/config.default.js /home/ubuntu/openhabcloud/newrelic.js
```


We will also need to give an app name to satisfy newrelic:
```
export NEW_RELIC_APP_NAME=openhabcloud
```


Now we are going to setup the database path for mongoDB for our instance:
```
sudo mkdir -p /data/db/
```


Now you can run openHAB Cloud by the following command:
```
sudo node app.js
```

Point your webbrowser to:

http://localhost:3000


You should be ready with your openHAB Cloud installation!




## Installing openHAB Cloud on Amazon Web Services (AWS) ##


###  Getting started with EC2 #

To install my.openHAB in the AWS cloud, you first need to create an account at Amazon Web Services.
Sign up for an AWS account [here](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html).

When you have created an account, you should be able to navigate to the the AWS Management Console
which is a simple web interface for managing your virtual server instances.


Make sure that your account has access to EC2 and click on Services -> EC2 link to open the EC2 dashboard.  
    
  
![AWS_1](https://bitbucket.org/repo/XkeoB7/images/3246542045-AWS_1.png)


  

The EC2 dashboard will look something like the image below:


  

![AWS_2.png](https://bitbucket.org/repo/XkeoB7/images/4281500224-AWS_2.png)

We now need to setup a virtual server to install and run the my.openHAB cloud application on the node.
Amazon calls the virtual servers instances. The EC2 instance is similar to a regular unmanaged web-server.

## How to create and launch the my.openHAB instance on AWS:

1. As mentioned before select EC2 (Amazon’s Elastic Compute Cloud) from the list of services:

2. In the menu bar, on the right corner you will find an item labelled “Region”:
Click to select your nearest region or chose a preffered region where you want to locate your virtual server.
We will use the [AWS Free Tier](https://aws.amazon.com/free/?nc1=h_ls), which includes services with a free tier available for 12 months following your AWS sign-up date. AWS cost varies between regions (be aware that is only free for the first year).


![AWS_4.png](https://bitbucket.org/repo/XkeoB7/images/510650928-AWS_4.png)

3. After choosing your region click the blue “Launch Instance” button:

 




4. Select an Amazon Machine Image (AMI) as base for my.openHAB cloud node:
The AMI is a template that contains the virtual server software configuration (operating system, application server, and applications) required to launch your instance.
You can select an Amazon AMI, from the user community or you can select one of your own AMIs. 

We are going to use a free tier and therefor select the Ubuntu Server, 64-bit by clicking on the blue "Select" button:

![AWS_6.png](https://bitbucket.org/repo/XkeoB7/images/2324700344-AWS_6.png)


You will see under the Ubuntu logo that there is a free tier eligible, what we want to use.
In our guide we are using the following AMI:
Ubuntu Server 14.04 LTS (HVM), SSD Volume Type - AMI ID: ami-fce3c696

![AWS_7.png](https://bitbucket.org/repo/XkeoB7/images/1972559131-AWS_7.png)

Leave the default selection with t2.micro where the green label says "Free tier eligible" and click on 
"Next: Configure Instance Details" to open the instance details page.

![AWS_7.png](https://bitbucket.org/repo/XkeoB7/images/2624956507-AWS_7.png)

Just go ahead since we will use the default values on the "Configure Instance Details" page.
Click on the button "Next: Add Storage". 

On the following page you see the storage device settings for your instance.
Just continue by clicking "Next: Tag Instance", since the default storage will be fine for us.

We dont need to Tag our Instance and we continue by clicking on "Next: Configure Security Group"

In the Configure Security Group page, leave the selected option for "Create a new security group" and
add rules for protocols and ports by clicking "Add Rule" like in the image below:

![AWS_8.png](https://bitbucket.org/repo/XkeoB7/images/1528904660-AWS_8.png)

We will add SSH to access and admin the instance (virtual server) by your console.
The next two rules a pretty straight forward and depends how you want to run my.openHAB cloud on your node.
We recommend to use only HTTPS for Security reason. In this example you also see that we added HTTP.

![AWS_8.png](https://bitbucket.org/repo/XkeoB7/images/4236667346-AWS_8.png)

After setting up the Security Group, go ahead by clicking the blue "Review and Launch" button.

You will see a summary of your Instance Launch, which will look like this image:

![AWS_9.png](https://bitbucket.org/repo/XkeoB7/images/1071632527-AWS_9.png)

Just hit the blue "Launch" button and you will be prompted to select or create a key pair
to connect securely to your instance.

Select the "Create a new key pair" option from the dropdown menue and
enter a name for your key pair (public and private key) and download your .pem file.
Warning: Dont loose this file, you will not be able to download it again!

![AWS_10.png](https://bitbucket.org/repo/XkeoB7/images/2742898306-AWS_10.png)

The key file must not be publicly viewable for SSH to work.
Open a terminal window and use this command to restrict access rights to the .pem file:

```
chmod 400 YOUR-PEM-FILENAME.pem
```

Finally under Instance you can see your instance starting up and running.


![AWS_11.png](https://bitbucket.org/repo/XkeoB7/images/407622469-AWS_11.png)

There you will find all the needed info to ssh into your node.
The important info is your Public DNS / Public IP adress.


![AWS_13.png](https://bitbucket.org/repo/XkeoB7/images/4281692947-AWS_13.png)

You can ssh to your instance with the user "ubuntu", see [here](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/managing-users.html) for more info on 
user accounts on linux instances. In terminal window run this command with your instance infos:

```
ssh -l ubuntu -i YOUR-PEM-FILENAME.pem YOUR-AWS-EC2-PUBLIC-DNS
```
 
Now you should be ready with your instance and see the welcome information of ubuntu.

5. Installing my.openHAB with needed SW

First we should make sure that your list of packages and dependencies from all repositories are up-to-date: 

```
sudo apt-get update
sudo apt-get upgrade
sudo apt-get dist-upgrade
```

If you got asked to continue, confirm with Yes (Y).

Now you need install git and clone the my.openHAB cloud repository to your home directory with
the following commands:

```
sudo apt-get install git
cd /home/ubuntu/
sudo git clone https://username@bitbucket.org/openhab/openhabcloud.git
```

Enter your password to clone the openhabcloud repro and after the completed checkout you
should have a directory in your home folder:

```
ls -al
total 32
drwxr-xr-x  5 ubuntu ubuntu 4096 Jun  4 17:06 .
drwxr-xr-x  3 root   root   4096 Jun  4 12:34 ..
-rw-r--r--  1 ubuntu ubuntu  220 Apr  9  2014 .bash_logout
-rw-r--r--  1 ubuntu ubuntu 3637 Apr  9  2014 .bashrc
drwx------  2 ubuntu ubuntu 4096 Jun  4 16:30 .cache
drwxr-xr-x 13 root   root   4096 Jun  4 17:06 openhabcloud
-rw-r--r--  1 ubuntu ubuntu  675 Apr  9  2014 .profile
drwx------  2 ubuntu ubuntu 4096 Jun  4 12:34 .ssh
```



Now we need to install the software bundles/stack on which openHAB Cloud is based on.
It is mainly based on the MEAN software stack, which makes use of mongoDB, Express.js, Angular,js and Node.js. For more infos read [here](https://en.wikipedia.org/wiki/MEAN_(software_bundle)).



```
sudo apt-get install nodejs mongodb git redis-server nginx npm nodejs-legacy
```

Now we need to change into the oenhabcloud dir and check if node is installed:

```
cd openhabcloud/
ls -al
node --version
```

If you see the node version, we can continue with runnung the following command
within the openhabcloud dir:
```
sudo npm install
```

We also need to install some more node dependencies:

```
sudo npm install time q node-forge engine.io socket.io-parser has-binary-data socket.io-adapter
sudo apt-get install libkrb5-dev
sudo npm install libxmljs
```

As last step we will add some libraries needed by node to connect to mongodb:

```
sudo npm install mongoose mongoose-types has-binary-data node-stringprep
```


openHAB Cloud uses redis for session management. To learn more about redis please read  
[here](http://redis.io). To check if redis is installed correctly and running we run this command:

```
redis-cli ping
```
Redis will answer with PONG if all is fine.

openHAB Cloud uses new relic to pinpoint and monitor node.js application performance issues.
We will create a dummy newrelic agent configuration file:

```
sudo cp /home/ubuntu/openhabcloud/node_modules/newrelic/lib/config.default.js /home/ubuntu/openhabcloud/newrelic.js
```

We will also need to give an app name to satisfy newrelic:
```
export NEW_RELIC_APP_NAME=openhabcloud
```

Now we are going to setup the database path for mongoDB on our instance:
```
sudo mkdir -p /data/db/
```


Next we have to configure nginx as webserver and copy the my.openHAB nginx config, overriding the default config:
```
sudo cp /home/ubuntu/openhabcloud/etc/nginx_openhabcloud.conf /etc/nginx/sites-available/default 
```

Change the following lines to match your instance.
- Point server_name to your AWS Public DNS
- Replace belovictor with ubuntu to have the correct dirstructure 

```
cd /etc/nginx/sites-enabled
sudo vi default
```

```
server {
#listen *:443;
listen *:80;
#ssl on;
# ssl_certificate /etc/nginx/ssl/my.openhab.org.godaddy-chain.crt;
# ssl_certificate_key /etc/nginx/ssl/my.openhab.org.key;
#ssl_certificate /etc/nginx/ssl/myopenhab-dfde.crt;
#ssl_certificate_key /etc/nginx/ssl/myopenhab.key;

server_name YOUR-AWS-EC2-PUBLIC-DNS;

#if ( $scheme = "http" ) {
#    rewrite ^/(.*)$    https://$host/$1 permanent;
#}

charset utf-8;

access_log /var/log/nginx/my.openhab.org-access.log;
error_log /var/log/nginx/my.openhab.org-error.log;
client_max_body_size 300m;

location /css {
    alias  /home/ubuntu/openhabcloud/public/css;
    }
location /js {
    alias /home/ubuntu/openhabcloud/public/js;
    }
location /img {
    alias /home/ubuntu/openhabcloud/public/img;
    }
location /bootstrap {
    alias /home/ubuntu/openhabcloud/public/bootstrap;
    }
location /font-icons {
    alias /home/ubuntu/openhabcloud/public/font-icons;
    }
location /fonts {
    alias /home/ubuntu/openhabcloud/public/fonts;
    }
location /js-plugin {
    alias /home/ubuntu/openhabcloud/public/js-plugin;
    }
location /downloads {
    alias /home/ubuntu/openhabcloud/public/downloads;
    }
location / {
    proxy_pass http://localhost:3000;
    proxy_redirect off;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr ;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for ;
        proxy_set_header X-Forwarded-Proto https;
}

#error_page 404 /404.html;

# redirect server error pages to the static page /50x.html
#
error_page 500 502 503 504 /50x.html;
location = /50x.html {
root html;
}
}
```


We need to restart nginx:

```
sudo service nginx restart
```


Now we are ready to start the openHAB Cloud service.
We will run openHAB Cloud as background service:
```
sudo nohup node app.js &
```

You should now point your webbrowser to:

http://YOUR-AWS-EC2-IP

or

http://YOUR-AWS-EC2-PUBLIC-DNS


You should be ready with your openHAB Cloud installation!


