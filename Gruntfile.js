module.exports = function(grunt) {

    grunt.initConfig({
        express: {
            test: {
                options: {
                    script: 'app.js',
                    output: ".*express server listening on port 3000.*",
                    node_env: 'development',
                    logs: {
                        out: '/dev/null'
                    }
                }
            }
        },
        'qunit-node': {
            options: {
                noglobals: true,
                setup: function (QUnit) {
                    // a separate function to report test failures
                    QUnit.on('testEnd', function (test) {
                        if (test.status !== 'failed') {
                            return;
                        }
                        grunt.log.writeln(('not ok ' + test.fullName.join(' > ')).red);
                        test.errors.forEach(function (error) {
                            grunt.log.writeln(error.message);
                        });
                    });
                }
            },
            test: {
                src: 'tests/qunit/**/*.js'
            }
        },
        mochaTest: {
            test: {
                options: {
                    reporter: 'spec'
                },
                src: ['tests/mocha/**/*.js']
            }
        }
    });

    grunt.loadNpmTasks('grunt-express-server');
    grunt.loadNpmTasks('grunt-qunit-node');
    grunt.loadNpmTasks('grunt-mocha-test');

    grunt.registerTask('mocha', ['express', 'mochaTest'])
    grunt.registerTask('default', ['qunit-node', 'mocha']);

};