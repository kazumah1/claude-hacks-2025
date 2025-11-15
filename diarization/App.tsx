import React, { useState } from 'react';
import { Mic, FileAudio } from 'lucide-react';
import AudioUploader from './components/AudioUploader';
import TranscriptDisplay from './components/TranscriptDisplay';
import { TranscriptResponse } from './types';

function App() {
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const apiKey = "sk_d0a607b380768df6b9d4e4acf4c6658177ab25271e51c81e";

  const handleTranscriptReceived = (data: TranscriptResponse) => {
    setTranscript(data);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <div className="flex justify-center items-center mb-4">
            <Mic className="h-10 w-10 text-blue-600" />
            <FileAudio className="h-10 w-10 text-blue-600 ml-2" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">ElevenLabs Diarization</h1>
          <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
            Upload an audio file with multiple speakers to transcribe the conversation and identify who said what.
          </p>
        </header>

        <main>
          <AudioUploader 
            onTranscriptReceived={handleTranscriptReceived} 
            apiKey={apiKey}
          />
          
          {transcript && <TranscriptDisplay transcript={transcript} />}
        </main>

        <footer className="mt-16 text-center text-sm text-gray-500">
          <p>Powered by ElevenLabs API</p>
          <p className="mt-1">
            This app uses the diarization feature to identify different speakers in audio recordings.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;