var runtimePort;
var peer;
var audioStream;
var micAndTabStream;

var mediaRecorder = null;;
var recordedChunks = [];

var accountName = null;
var accountCIS = null;
var userId = null;
var date = null;

var constraints = {
	video: true, 
	audio: true,
    videoConstraints: {
        mandatory: {
	        // If minWidth/Height have the same aspect ratio (e.g., 16:9) as
	        // maxWidth/Height, the implementation will letterbox/pillarbox as
	        // needed. Otherwise, set minWidth/Height to 0 to allow output video
	        // to be of any arbitrary size.
	        chromeMediaSource: 'tab',
	        minWidth: 16,
	        minHeight: 9,
	        maxWidth: 2000,
	        maxHeight: 2000,
	        maxFrameRate: 60,  
            googLeakyBucket: true,
            googTemporalLayeredScreencast: true
    	},
  	},
};

var options = {
	mimeType: "video/webm"
};

chrome.runtime.onConnect.addListener((port) => {
	runtimePort = port;

	runtimePort.onMessage.addListener((message) => {
		if(message.component === 'sdp'){
			createAnswer(message.message);
		}else if(message.component === 'start-recording'){
			if(message.message !== ''){
                accountName = message.message.name;
                accountCIS = message.message.CIS;
                userId = message.message.userId;
                date = message.message.date;
				startRecording(accountName, accountCIS, userId, date);
			}
		}else if(message.component === 'stop-recording' && mediaRecorder !== null){
            stopRecording();
        }
	});
});

////////////////////////////////////////////////////////////////////////////////////////////

chrome.browserAction.onClicked.addListener(function() {
    askContentScriptToSendMicrophone(runtimePort.sender.tab.id);
});

function askContentScriptToSendMicrophone(tabId) {
    chrome.tabs.update(tabId, {
        active: true
    }, function() {
        let component = 'microphone';
        let message = 'get-microphone';
		sendMessageToContentScript(component,message);
    });
}

function sendMessageToContentScript(component,message){
	var body = {
		component: component,
		message: message
	}

	runtimePort.postMessage(body);
}

function createAnswer(sdp){
	peer = new webkitRTCPeerConnection(null);

	peer.onicecandidate = (event) => {
        if (!event || !!event.candidate) return;

        var component = 'sdp';
        var message = peer.localDescription;
        
        sendMessageToContentScript(component,message);
    };

    peer.onaddstream = function(event) {
        audioStream = event.stream;
        captureTab();
    };

    peer.setRemoteDescription(new RTCSessionDescription(sdp));

    peer.createAnswer(function(sdp) {
        peer.setLocalDescription(sdp);
    }, function() {}, {
        optional: [],
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: false
        }
    });
}

function captureTab(){
	chrome.tabCapture.capture(constraints,
		(stream) => {
            if (audioStream && audioStream.getAudioTracks && audioStream.getAudioTracks().length) {
                audioPlayer = document.createElement('audio');
                audioPlayer.muted = true;
                audioPlayer.volume = 0;
                audioPlayer.src = URL.createObjectURL(audioStream);
                audioPlayer.play();
                
                let singleAudioStream = getMixedAudioStream([stream, audioStream]);
                singleAudioStream.addTrack(stream.getVideoTracks()[0]);
                micAndTabStream = singleAudioStream;
            }
        }
	);
}



var audioPlayer, context, mediaStreamSource, mediaStreamDestination;

function getMixedAudioStream(arrayOfMediaStreams) {
    // via: @pehrsons
    context = new AudioContext();
    let audioSources = [];

    let gainNode = context.createGain();
    gainNode.connect(context.destination);
    gainNode.gain.value = 0; // don't hear self

    let audioTracksLength = 0;
    arrayOfMediaStreams.forEach(function(stream) {
        if (!stream.getAudioTracks().length) {
            return;
        }

        audioTracksLength++;

        let audioSource = context.createMediaStreamSource(stream);
        audioSource.connect(gainNode);
        audioSources.push(audioSource);
    });

    if (!audioTracksLength) {
        return;
    }

    mediaStreamDestination = context.createMediaStreamDestination();
    audioSources.forEach(function(audioSource) {
        audioSource.connect(mediaStreamDestination);
    });
    return mediaStreamDestination.stream;
}

function startRecording(accountName, accountCIS, userId, date){
	this.accountName = accountName;
    this.accountCIS = accountCIS;
    this.userId = userId;
    this.date = date;

    recordedChunks = [];
	mediaRecorder = new MediaRecorder(micAndTabStream, options);
  	
  	mediaRecorder.ondataavailable = function(event){
		if(event.data.size > 0){
			recordedChunks.push(event.data);
		}
	}

	mediaRecorder.onstop = function(){
		let blob = new Blob(recordedChunks, {
            type: 'video/webm'
        });
        
        let fileName = userId+'_'+accountCIS+'_'+accountName+'_'+date+'.webm';
        
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
	}
  	mediaRecorder.start();
}

function stopRecording(){
	mediaRecorder.stop();
    mediaRecorder = null;
}