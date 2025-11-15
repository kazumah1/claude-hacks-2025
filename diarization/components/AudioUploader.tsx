import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Loader2 } from 'lucide-react';
import { TranscriptResponse } from '../types';

interface AudioUploaderProps {
  onTranscriptReceived: (transcript: TranscriptResponse) => void;
  apiKey: string;
}

const AudioUploader: React.FC<AudioUploaderProps> = ({ onTranscriptReceived, apiKey }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select an audio file first');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('model_id', 'scribe_v1');
    formData.append('diarize', 'true');
    formData.append('timestamps_granularity', 'word');

    try {
      const response = await axios.post<TranscriptResponse>(
        'https://api.elevenlabs.io/v1/speech-to-text',
        formData,
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      onTranscriptReceived(response.data);
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(
        err instanceof Error 
          ? err.message 
          : 'An error occurred while processing your audio file'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Upload Audio File</h2>
      
      <div className="mb-4">
        <div 
          onClick={triggerFileInput}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Click to select an audio file
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Supports MP3, WAV, M4A, etc.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="hidden"
          />
        </div>
        
        {selectedFile && (
          <div className="mt-2 text-sm text-gray-700">
            Selected: <span className="font-medium">{selectedFile.name}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={isUploading || !selectedFile}
        className={`w-full py-2 px-4 rounded-md font-medium ${
          isUploading || !selectedFile
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } transition-colors flex items-center justify-center`}
      >
        {isUploading ? (
          <>
            <Loader2 className="animate-spin mr-2 h-4 w-4" />
            Processing...
          </>
        ) : (
          'Transcribe Audio'
        )}
      </button>
    </div>
  );
};

export default AudioUploader;