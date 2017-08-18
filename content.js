var peer;
var runtimePort = chrome.runtime.connect({
	name: "KBank-DSM"
});

window.addEventListener('message', (event) => {
	var component = event.data.component;
	if(event.data.component === 'start-recording'){
		let message = event.data.message;
		sendMessageToBackgroundScript(component,message);
	}else if(event.data.component === 'stop-recording'){
		let message = 'stop-recording';
		sendMessageToBackgroundScript(component,event.data.message);
	}
});

runtimePort.onMessage.addListener((message) => {
	if(message.component === 'microphone'){
		if(message.message === 'get-microphone'){
			getMicrophone();
		} 
	}else if(message.component === 'sdp'){
		peer.setRemoteDescription(new RTCSessionDescription(message.message));
	}	
});

function sendMessageToBackgroundScript(component,message){
	var body = {
		component: component,
		message: message
	}

	runtimePort.postMessage(body);
}




function getMicrophone(){
	var streamToSend;
	var audioPlayer;

	navigator.mediaDevices.getUserMedia({
		audio: true,
	})
	.then((stream) => {
		streamToSend = stream;

		audioPlayer = document.createElement('audio');
        audioPlayer.muted = true;
        audioPlayer.volume = 0;
        audioPlayer.src = (window.URL || window.webkitURL).createObjectURL(streamToSend);
        (document.body || document.documentElement).appendChild(audioPlayer);
        audioPlayer.play();

        audioPlayer.onended = function() {
            console.warn('Audio player is stopped.');
        };

        audioPlayer.onpause = function() {
            console.warn('Audio player is paused.');
        };

		peer = new webkitRTCPeerConnection(null);
		peer.addStream(streamToSend);

		peer.onicecandidate = (event) => {
            if (!event || !!event.candidate) return;

            var component = 'sdp';
            var message = peer.localDescription;
            
            sendMessageToBackgroundScript(component,message);
        };

        peer.oniceconnectionstatechange = function() {
        	if(!peer) return;

            if(streamToSend && peer.iceConnectionState == 'failed' || peer.iceConnectionState == 'disconnected') {
            	console.log('failed');
            	streamToSend.getAudioTracks().forEach(function(track) {
            		track.stop();
            	});

            	streamToSend.getVideoTracks().forEach(function(track) {
            		track.stop();
            	});

            	streamToSend = null;
            }
        };

        peer.createOffer(function(sdp) {
            peer.setLocalDescription(sdp);
        }, function() {}, {
            optional: [],
            mandatory: {
                OfferToReceiveAudio: false,
                OfferToReceiveVideo: false
            }
        });
	})
	.catch(function(error) {
	    console.log(error);
	});
}

