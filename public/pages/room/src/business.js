class Business {
  constructor({ room, media, view, socketBuilder, peerBuilder }) {
    this.room = room;
    this.media = media;
    this.view = view;

    this.socketBuilder = socketBuilder;
    this.peerBuilder = peerBuilder;
    this.currentStream = {};
    this.socket = {};
    this.currentPeer = {};

    this.peers = new Map();
    this.userRecordings = new Map();
  }

  static initialize(deps) {
    const instance = new Business(deps);
    return instance._init();
  }

  async _init() {
    this.view.configureRecordButton(this.onRecordPressed.bind(this));
    this.currentStream = await this.media.getCamera(true);

    this.socket = this.socketBuilder
      .setOnUserConnected(this.onUserConnected())
      .setOnUserDisconnected(this.onUserDisconnected())
      .build();

    this.currentPeer = await this.peerBuilder
      .setOnError(this.onPeerError())
      .setOnConnectionOpened(this.onPeerConnectionOpened())
      .setOnCallReceived(this.onPeerCallReceived())
      .setOnPeerStreamReceived(this.onPeerStreamReceived())
      .setOnCallError(this.onPeerCallError())
      .setOnCallClose(this.onPeerCallClose())
      .build();

    this.addVideoStream(this.currentPeer.id);
  }

  addVideoStream(userId, stream = this.currentStream) {
    const recordInstance = new Recorder(userId, stream);
    this.userRecordings.set(recordInstance.filename, recordInstance);
    if (this.recordingEnabled) {
      recordInstance.startRecording();
    }

    const isCurrentId = false;
    this.view.renderVideo({
      userId,
      // muted: true,
      stream,
      isCurrentId,
    });
  }

  onUserConnected() {
    return (userId) => {
      console.log('user connected!', userId);
      this.currentPeer.call(userId, this.currentStream);
    };
  }

  onUserDisconnected() {
    return (userId) => {
      console.log('user disconnected!', userId);
      if (this.peers.has(userId)) {
        this.peers.get(userId).call.close();
        this.peers.delete(userId);

        this.view.setParticipants(this.peers.size);
        this.view.removeVideoElement(userId);
      }
    };
  }

  onPeerError() {
    return (error) => {
      console.error('error on peer!', error);
    };
  }

  onPeerConnectionOpened() {
    return (peer) => {
      const id = peer.id;
      console.log('peer!!', peer);
      this.socket.emit('join-room', this.room, id);
    };
  }

  onPeerCallReceived() {
    return (call) => {
      console.log('answering call', call);
      call.answer(this.currentStream);
    };
  }

  onPeerStreamReceived() {
    return (call, stream) => {
      const callerId = call.peer;
      if (!this.peers.has(callerId)) {
        this.addVideoStream(callerId, stream);
        this.peers.set(callerId, { call });
        this.view.setParticipants(this.peers.size);
      }
    };
  }

  onPeerCallError() {
    return (call, error) => {
      console.log('an call error occurred', error);
      this.view.removeVideoElement(call.peer);
    };
  }

  onPeerCallClose() {
    return (call) => {
      console.log('call closed!', call.peer);
    };
  }

  onRecordPressed(recordingEnabled) {
    this.recordingEnabled = recordingEnabled;
    console.log('pressed');

    for (const [key, value] of this.userRecordings) {
      if (this.recordingEnabled) {
        value.startRecording();
        continue;
      }

      this.stopRecording(key);
    }
  }

  async stopRecording(userId) {
    const usersRecordings = this.userRecordings;
    for (const [key, value] of this.userRecordings) {
      const isContextUser = key.includes(userId);
      if (!isContextUser) continue;

      const rec = value;
      const isRecordingActive = rec.isRecordingActive;

      if (!isRecordingActive) continue;
      await rec.stopRecording();
    }
  }
}
