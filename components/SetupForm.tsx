import React, { useState } from 'react';
import { GENRES, AVAILABLE_VOICES } from '../types';
import { Button } from './Button';
import { Sparkles, Users, BookOpen } from 'lucide-react';
import { generateSurpriseSetup } from '../services/gemini';

interface SetupFormProps {
  onStart: (data: { genre: string; premise: string; characters: string[] }) => void;
  isLoading: boolean;
}

export const SetupForm: React.FC<SetupFormProps> = ({ onStart, isLoading }) => {
  const [genre, setGenre] = useState(GENRES[0]);
  const [premise, setPremise] = useState('');
  const [characters, setCharacters] = useState(['Hero', 'Villain']);
  const [isSurprising, setIsSurprising] = useState(false);

  const handleCharacterChange = (index: number, value: string) => {
    const newChars = [...characters];
    newChars[index] = value;
    setCharacters(newChars);
  };

  const addCharacter = () => setCharacters([...characters, 'New Character']);
  const removeCharacter = (index: number) => setCharacters(characters.filter((_, i) => i !== index));

  const handleSurpriseMe = async () => {
    setIsSurprising(true);
    try {
      const data = await generateSurpriseSetup();
      setGenre(data.genre);
      setPremise(data.premise);
      setCharacters(data.characters);
    } catch (e) {
      console.error("Surprise generation failed", e);
      // Fallback
      const randomGenres = GENRES;
      setGenre(randomGenres[Math.floor(Math.random() * randomGenres.length)]);
      setPremise("A mysterious event forces two unlikely allies to work together to save their world from imminent destruction.");
      setCharacters(["The Skeptic", "The Believer", "The AI"]);
    } finally {
      setIsSurprising(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
          <BookOpen className="w-8 h-8 text-indigo-500" />
          Script Seance
        </h1>
        <p className="text-gray-400">Generate interactive screenplays with AI voice acting</p>
      </div>

      <div className="space-y-6">
        {/* Genre Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Genre</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={`px-3 py-2 text-sm rounded-lg transition-all ${
                  genre === g 
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Premise */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Premise</label>
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            className="w-full h-24 bg-gray-800 border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="e.g., A detective discovers his new partner is a ghost..."
          />
        </div>

        {/* Characters */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Characters</span>
            <button onClick={addCharacter} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add</button>
          </label>
          <div className="space-y-2">
            {characters.map((char, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={char}
                  onChange={(e) => handleCharacterChange(idx, e.target.value)}
                  className="flex-1 bg-gray-800 border-gray-700 rounded-lg p-2 text-white text-sm"
                  placeholder={`Character ${idx + 1}`}
                />
                {characters.length > 1 && (
                  <button 
                    onClick={() => removeCharacter(idx)}
                    className="text-red-400 hover:text-red-300 px-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-800">
          <Button 
            variant="secondary" 
            onClick={handleSurpriseMe} 
            className="flex-1"
            type="button"
            loading={isSurprising}
            disabled={isLoading || isSurprising}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Surprise Me
          </Button>
          <Button 
            variant="primary" 
            onClick={() => onStart({ genre, premise, characters })}
            className="flex-[2]"
            loading={isLoading}
            disabled={!premise.trim() || isLoading || isSurprising}
          >
            Start Writing
          </Button>
        </div>
      </div>
    </div>
  );
};