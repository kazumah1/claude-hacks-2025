import React, { useMemo } from 'react';
import { TranscriptResponse } from '../types';

interface TranscriptDisplayProps {
  transcript: TranscriptResponse | null;
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript }) => {
  const speakerColors = useMemo(() => {
    if (!transcript) return {};
    
    const uniqueSpeakers = new Set<string>();
    transcript.words.forEach(word => {
      if (word.speaker_id) {
        uniqueSpeakers.add(word.speaker_id);
      }
    });
    
    const colors = [
      'bg-blue-100 border-blue-300',
      'bg-green-100 border-green-300',
      'bg-purple-100 border-purple-300',
      'bg-yellow-100 border-yellow-300',
      'bg-pink-100 border-pink-300',
      'bg-indigo-100 border-indigo-300',
      'bg-red-100 border-red-300',
      'bg-orange-100 border-orange-300',
    ];
    
    const speakerColorMap: Record<string, string> = {};
    Array.from(uniqueSpeakers).forEach((speaker, index) => {
      speakerColorMap[speaker] = colors[index % colors.length];
    });
    
    return speakerColorMap;
  }, [transcript]);

  const groupedBySpeaker = useMemo(() => {
    if (!transcript) return [];
    
    const result: { speaker: string; text: string; startTime: number }[] = [];
    let currentSpeaker = '';
    let currentText = '';
    let startTime = 0;
    
    transcript.words.forEach((word, index) => {
      if (word.type === 'word') {
        if (currentSpeaker === '') {
          // First word
          currentSpeaker = word.speaker_id;
          currentText = word.text;
          startTime = word.start;
        } else if (word.speaker_id !== currentSpeaker) {
          // Speaker changed
          result.push({
            speaker: currentSpeaker,
            text: currentText.trim(),
            startTime
          });
          currentSpeaker = word.speaker_id;
          currentText = word.text;
          startTime = word.start;
        } else {
          // Same speaker continues
          currentText += word.text;
        }
      } else if (word.type === 'spacing') {
        currentText += ' ';
      }
      
      // Handle last word
      if (index === transcript.words.length - 1 && currentSpeaker) {
        result.push({
          speaker: currentSpeaker,
          text: currentText.trim(),
          startTime
        });
      }
    });
    
    return result;
  }, [transcript]);

  if (!transcript) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-8">
      <h2 className="text-xl font-semibold mb-4">Transcript</h2>
      
      <div className="mb-4 text-sm text-gray-600">
        <p>Language: {transcript.language_code} (Confidence: {Math.round(transcript.language_probability * 100)}%)</p>
        <p>Total speakers detected: {Object.keys(speakerColors).length}</p>
      </div>
      
      <div className="space-y-4">
        {groupedBySpeaker.map((segment, index) => (
          <div key={index} className="flex">
            <div className="w-20 flex-shrink-0 text-sm text-gray-500 pt-1">
              {formatTime(segment.startTime)}
            </div>
            <div className={`flex-grow p-3 rounded-lg border ${speakerColors[segment.speaker]}`}>
              <div className="font-medium mb-1">
                {segment.speaker.replace('speaker_', 'Speaker ')}
              </div>
              <p>{segment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptDisplay;