const gulp = require('gulp');
const path = require('path');
const del = require('del');
const ts = require('gulp-typescript');
const mocha = require('gulp-spawn-mocha');
const tslint = require('gulp-tslint');
const plumber = require('gulp-plumber');
const sourcemaps = require('gulp-sourcemaps');
const runSequence = require('run-sequence');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const merge = require('merge2');
const Builder = require('systemjs-builder')
const liveServer = require('gulp-live-server');
const argv = require('yargs').argv;

function seq() {
	const tasks = Array.prototype.slice.call(arguments, 0);
	return done => runSequence.apply(runSequence, tasks.concat([done]));
}

gulp.task('clean', function () {
	return del([
		'dist/*',
	]);
});

const project = ts.createProject('tsconfig.json');
const scripts = ['src/**/*.ts'];
const buildTask = argv.coverage ? 'build-demo-coverage-remap' : (argv.tests ? 'build-demo-tests' : 'build-demo');

gulp.task('build', function () {
	const result = gulp.src(scripts)
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
	const builder = new Builder('', 'src/demo/config.js');
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

gulp.task('server', function () {
	const server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	gulp.watch(['src/demo/**/*.html'], server.notify.bind(server));
	gulp.watch(['dist/**/*.js'], function () {
		server.start();
	});
});

gulp.task('watch', function () {
	gulp.watch(scripts, [buildTask]);
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

gulp.task('remap', function () {
	return gulp.src('coverage/coverage.json')
		.pipe(remapIstanbul({
			reports: {
				html: 'coverage-remapped'
			}
		}));
});

gulp.task('build-demo', seq('build', 'demo'));
gulp.task('build-demo-tests', seq('build', 'demo', 'tests'));
gulp.task('build-demo-coverage-remap', seq('build', 'demo', 'coverage', 'remap'));
gulp.task('dev', seq('clean', buildTask, 'server', 'watch'));
gulp.task('cov', seq('build', 'coverage', 'remap'));
gulp.task('test', seq('build', 'tests'));
