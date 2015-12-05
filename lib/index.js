'use strict';

var path = require( 'path' );
var domain = require( 'domain' );
var fs = require( 'fs-extra' );
var url = require( 'url' );
var async = require( 'async' );
var request = require('request');



function getOutPath( outdir, urlstr ) {
	var parsed = url.parse( urlstr );
	return path.join( outdir, parsed.path );
}


function buildNewUrl( newRootUrl, urlstr ) {
	var parsed = url.parse( urlstr );
	if ( newRootUrl[ newRootUrl.length-1 ] !== '/' ) {
		newRootUrl += '/';
	}
	var suffix = parsed.path;
	if ( suffix[0] === '/' ) {
		suffix = suffix.substr( 1 );
	}
	return newRootUrl + suffix;
}


function getFilesToDownload( swjson, newRootUrl, outdir, output ) {
	output = output || [];
	if ( !swjson.dependencies ) {
		return output;
	}
	for ( var name in swjson.dependencies ) {
		if ( swjson.dependencies.hasOwnProperty( name ) ) {
			var dep = swjson.dependencies[ name ];
			if ( dep.resolved ) {
				var outpath = getOutPath( outdir, dep.resolved );
				var newUrl = buildNewUrl( newRootUrl, dep.resolved );
				output.push( { url: dep.resolved, out: outpath } );
				dep.resolved = newUrl;
			}
			getFilesToDownload( dep, newRootUrl, outdir, output );
		}
	}
	return output;
}


function download( file, callback ) {
	function onError( err ) {
		console.error( "Error downloading '" + file.url + "'" );
		console.error( err );
		callback();
	}
	var d = domain.create();
	d.on( 'error', onError );
	d.run( function() {
		var dir = path.dirname( file.out );
		fs.ensureDirSync( dir );
		console.log( "Downloading " + file.url );
		request
			.get( file.url )
			.on( 'error', onError )
			.pipe( fs.createWriteStream( file.out ) )
			.on( 'error', onError )
			.on( 'close', callback );
	} );
}


function start( options ) {
	options = options || {};
	options.shrinkwrap = options.shrinkwrap || 'npm-shrinkwrap.json';
	options.outdir = options.outdir || 'www';
	options.downloadLimit = options.downloadLimit || 4;
	options.shrinkwrap = path.resolve( options.shrinkwrap );
	if ( !fs.existsSync( options.shrinkwrap ) ) {
		console.error( "Shrinkwrap file '" + options.shrinkwrap + "' not found!" );
		return;
	}
	if ( !options.outshrinkwrap ) {
		options.outshrinkwrap = options.shrinkwrap;
	}
	options.outshrinkwrap = path.resolve( options.outshrinkwrap );
	
	var swjson = JSON.parse( fs.readFileSync( options.shrinkwrap ) );

	options.outdir = path.resolve( options.outdir );
	fs.ensureDirSync( options.outdir );
	var files = getFilesToDownload( swjson, options.url, options.outdir );
	if ( files.length <= 0 ) {
		console.log( "No dependencies found to download" );
	}
	async.eachLimit( files, options.downloadLimit, download, function( err ) {
		if ( err ) {
			console.error( "Download queue aborted" );
			console.error( err );
		} else {
			fs.writeFileSync( options.outshrinkwrap, JSON.stringify( swjson, null, 2 ) );	
			console.log( "Complete" );
		}
	} );
}

module.exports = start;
