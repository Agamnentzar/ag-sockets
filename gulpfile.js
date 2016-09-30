var gulp = require('gulp');
var path = require('path');
var del = require('del');
var ts = require('gulp-typescript');
var mocha = require('gulp-spawn-mocha');
var tslint = require('gulp-tslint');
var plumber = require('gulp-plumber');
var sourcemaps = require('gulp-sourcemaps');
var runSequence = require('run-sequence');
var remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
var merge = require('merge2');
var Builder = require('systemjs-builder')
var liveServer = require('gulp-live-server');
var argv = require('yargs').argv;

gulp.task('empty', function () { });

gulp.task('clean', function () {
	return del([
		'dist/*',
	]);
});

var project = ts.createProject('tsconfig.json');
var scripts = ['src/**/*.ts'];

gulp.task('build', function () {
	var result = gulp.src(scripts)
		.pipe(sourcemaps.init())
		.pipe(project(ts.reporter.defaultReporter()));

	return merge([
		result.dts
			.pipe(gulp.dest('dist')),
		result.js
			.pipe(sourcemaps.write({ sourceRoot: path.resolve('src') }))
			.pipe(gulp.dest('dist')),
	]);
});

gulp.task('demo', function () {
	var builder = new Builder('', 'src/demo/config.js');
	return builder.buildStatic('dist/demo/demoClient.js', 'dist/demo/demo.js');
});

gulp.task('tests', function () {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
		}));
});

gulp.task('coverage', function () {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
			istanbul: {
				print: 'none',
			},
		}));
});

gulp.task('coverage-remap', function (done) {
	runSequence('coverage', 'remap', done);
});

gulp.task('server', function () {
	var server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	gulp.watch(['src/demo/**/*.html'], server.notify.bind(server));
	gulp.watch(['dist/**/*.js'], function () {
		server.start();
	});
});

gulp.task('watch', function () {
	gulp.watch(scripts, ['build-and-demo']);

	if (argv.tests || argv.coverage)
		gulp.watch(scripts, [argv.coverage ? 'coverage-remap' : 'tests']);
});

gulp.task('lint', function () {
	return gulp.src(scripts)
		.pipe(plumber())
		.pipe(tslint({
			report: 'verbose',
			configuration: require('./tslint.json')
		}))
		.pipe(tslint.report());
});

gulp.task('build-and-demo', function (done) {
	runSequence('build', 'demo', done);
});

gulp.task('dev', function (done) {
	runSequence('clean', 'build-and-demo', argv.coverage ? 'coverage-remap' : (argv.tests ? 'tests' : 'empty'), 'server', 'watch', done);
});

gulp.task('cov', function (done) {
	runSequence('build', 'coverage', 'remap', done);
});

gulp.task('test', function (done) {
	runSequence('build', 'tests', done);
});

gulp.task('remap', function () {
	return gulp.src('coverage/coverage.json')
		.pipe(remapIstanbul({
			reports: {
				html: 'coverage-remapped'
			}
		}));
});
