# openHAB-cloud: Unit Testing, Integration Testing & Test Coverage

## Introduction
The openHAB-cloud NodeJS application currently lacks in terms of code quality and tests. It cannot be well maintained and improved with features when the app doesn't have good tests. Therefor openHAB-cloud must be improved, regarding tests and code coverage for main functions and modules. The overall target is that openHAB-cloud can grow healthy and fast when it comes to new features, next to the big advantage that all community pull requests can be automatically tested before a merge. Feature growth, updates or migration processes will become more easier and comfortable by following the principle: No refactorings without proper tests.


## Testing strategy

This testing strategy should serve as a quick start to get an overview about the ideas on how to test openHAB-cloud and to better understand the choosen approach and tools. With some developer experience with adding tests to the existing application, we propose 
the following testing strategy:

#### Unit tests level:
Unit Testing is the process where individual code blocks,
functions, methods, or “units” of code are tested
individually. Test should cover each small function\method, isolated on the application.
The main approach and goals for unit tests at openHAB-cloud are:
1. Each route method should be tested
2. Each mongoose model function should be tested 
3. Each openHAB proxy method should be tested
4. Each app.js function should be tested

#### Integration test level:
The integration tests will use real-world data and integrate with external interfaces like
e.g. MongoDB, Redis, NodeJS app and  Nginx. To realize the integrations tests, we are going to use Docker with the following approach:
1. Test each module with a public API 
2. Test each web page, which can be accessed

## Testing Frameworks

openHAB-cloud has currently a few qunit tests. It should kept in mind, that QUnit is an old library with the main proposal/idea to test jQuery plugins. For this reason it is not the best choice to write proper new tests for a NodeJS application like openHAB-cloud.  

1. Mocha as a Test Runner. 
Mocha is a really popular testing tool in the NodeJS world and has a low barrier for developers to use it, compared to other tools: 
https://stackshare.io/stackups/jasmine-vs-jest-vs-mocha

Mocha is also easy to expand, because it is delegating some features to other 
libraries, like the asserting to Chai or it is using Sinon for a fake server or Test doubles.
2. Chai as assertion library. It has a good integration with Mocha and active and large community.
Chai has also many plugins (https://www.chaijs.com/plugins/)
as extension points and integration with other modules.
3. Sinon for Test Doubles and Fake Servers. This library has a good documentation
 and pretty well integration with Mocha. 
4. Istanbul for code coverage. 
Istanbul is a JavaScript code coverage tool that computes statement, line, 
function and branch coverage with module loader hooks to transparently add coverage 
when running tests. This library has a good compatibility with other stacks.

#### Alternatives:
The main alternative tool to improve test coverage is the Jasmine tool.
Jasmine has its own assertion and Test Doubles modules and does not depend on 
3rd parties. But this point also makes Jasmine a less flexible and not so well suited for the openHAB-cloud testing activities. 



## Running Unit Tests

To run the Unit tests, please execute the following commands:
```cd /tests```
```npm test```

The Test coverage report can be found in the folder ``/coverage``

## Running Integrations Tests

To run the Integration tests, execute this command:
```npm run integration_tests```