import React, { useState } from 'react';
import { X, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Question, MessageContent } from '../../schemas';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface QuestionsModalProps {
  questions: Question[];
  onSubmit: (content: MessageContent[]) => void;
  onCancel: () => void;
}

export const QuestionsModal: React.FC<QuestionsModalProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, Set<number>>>({});
  const [questionCustomAnswers, setQuestionCustomAnswers] = useState<Record<number, string>>({});
  const [customAnswerInput, setCustomAnswerInput] = useState('');
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  if (questions.length === 0) return null;

  const currentQuestion = questions[currentQuestionIndex];
  const currentSelections = questionAnswers[currentQuestionIndex] || new Set<number>();
  const isRadio = currentQuestion.min === 1 && currentQuestion.max === 1;
  const hasCustomAnswer = questionCustomAnswers[currentQuestionIndex]?.trim();
  const totalAnswers = currentSelections.size + (hasCustomAnswer ? 1 : 0);
  const canProceed = totalAnswers >= currentQuestion.min;

  const handleToggleOption = (optionIndex: number) => {
    const newSelections = new Set(currentSelections);
    if (isRadio) {
      // Radio: clear all and select current
      newSelections.clear();
      newSelections.add(optionIndex);
    } else {
      // Checkbox: toggle current
      if (newSelections.has(optionIndex)) {
        newSelections.delete(optionIndex);
      } else if (newSelections.size < currentQuestion.max) {
        newSelections.add(optionIndex);
      }
    }
    setQuestionAnswers({ ...questionAnswers, [currentQuestionIndex]: newSelections });
  };

  const handleSaveCustomAnswer = () => {
    if (customAnswerInput.trim()) {
      setQuestionCustomAnswers({
        ...questionCustomAnswers,
        [currentQuestionIndex]: customAnswerInput.trim(),
      });
    } else {
      // Remove custom answer if empty
      const newCustomAnswers = { ...questionCustomAnswers };
      delete newCustomAnswers[currentQuestionIndex];
      setQuestionCustomAnswers(newCustomAnswers);
    }
    setIsEditingCustom(false);
    setCustomAnswerInput('');
  };

  const handleNext = () => {
    if (!canProceed) return;

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    if (!canProceed) return;

    // Format answers as markdown
    let questionText = '## Questions\n';
    let answerText = '## Answers\n';

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const selections = questionAnswers[i] || new Set<number>();
      const customAnswer = questionCustomAnswers[i];

      answerText += `**${question.name}:**\n`;
      questionText += `**${question.name}:** ${question.min === question.max ? `(choose ${question.min})` : `(choose ${question.min}-${question.max})`}\n`;

      for (const option of question.options) {
        questionText += `- ${option.label}?\n`;
      }

      if (selections.size > 0) {
        Array.from(selections).forEach((optionIndex) => {
          if (optionIndex < question.options.length) {
            answerText += `- ${question.options[optionIndex].label}\n`;
          }
        });
      }

      if (customAnswer) {
        answerText += `- ${customAnswer}\n`;
      }

      if (selections.size === 0 && !customAnswer) {
        answerText += `- (no answer provided)\n`;
      }

      if (question.custom) {
        questionText += `- *${question.customLabel || 'Other'}?*\n`;
      }

      answerText += '\n';
      questionText += '\n';
    }

    // Create content array with questions and answers
    const content: MessageContent[] = [
      { type: 'text', content: questionText.trim() },
      { type: 'text', content: answerText.trim() },
    ];

    onSubmit(content);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-neon-cyan">Questions</h2>
            <p className="text-sm text-muted-foreground">
              {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Question tabs */}
        <div className="flex gap-2 p-3 border-b border-border overflow-x-auto">
          {questions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentQuestionIndex(idx)}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors whitespace-nowrap h-8',
                idx === currentQuestionIndex
                  ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              )}
            >
              {q.name}
            </button>
          ))}
        </div>

        {/* Question content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <h3 className="text-base font-medium text-foreground mb-1">{currentQuestion.name}</h3>
            <p className="text-sm text-muted-foreground">
              Select {currentQuestion.min === currentQuestion.max
                ? currentQuestion.min
                : `${currentQuestion.min}-${currentQuestion.max}`} option(s)
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected = currentSelections.has(optionIndex);
              return (
                <button
                  key={optionIndex}
                  onClick={() => handleToggleOption(optionIndex)}
                  className={cn(
                    'w-full text-left p-3 rounded border transition-colors',
                    isSelected
                      ? 'bg-neon-cyan/10 border-neon-cyan text-neon-cyan'
                      : 'bg-muted/50 border-border hover:border-muted-foreground'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isRadio ? (
                        <div className={cn(
                          'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                          isSelected ? 'border-neon-cyan' : 'border-muted-foreground'
                        )}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-neon-cyan" />}
                        </div>
                      ) : (
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center',
                          isSelected ? 'border-neon-cyan bg-neon-cyan' : 'border-muted-foreground'
                        )}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-background" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={cn(
                        'font-medium',
                        isSelected ? 'text-neon-cyan' : 'text-foreground'
                      )}>{option.label}</div>
                      {option.description && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom answer */}
          {currentQuestion.custom && (
            <div className="pt-2">
              {!isEditingCustom ? (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingCustom(true);
                      setCustomAnswerInput(questionCustomAnswers[currentQuestionIndex] || '');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {hasCustomAnswer ? 'Edit custom answer' : currentQuestion.customLabel || 'Other (custom answer)'}
                  </Button>
                  {hasCustomAnswer && (
                    <div className="mt-2 p-3 bg-neon-cyan/10 border border-neon-cyan rounded text-sm">
                      <div className="font-medium text-neon-cyan mb-1">Custom answer:</div>
                      <div className="text-foreground">{questionCustomAnswers[currentQuestionIndex]}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {currentQuestion.customLabel || 'Other (custom answer)'}
                  </label>
                  <Input
                    value={customAnswerInput}
                    onChange={(e) => setCustomAnswerInput(e.target.value)}
                    placeholder="Enter your answer..."
                    className="w-full mt-1"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="neon"
                      size="sm"
                      onClick={handleSaveCustomAnswer}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingCustom(false);
                        setCustomAnswerInput('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation message */}
          {!canProceed && (
            <div className="text-sm text-yellow-400">
              Please select at least {currentQuestion.min} option(s) to continue
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentQuestionIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          {currentQuestionIndex < questions.length - 1 ? (
            <Button
              variant="neon"
              onClick={handleNext}
              disabled={!canProceed}
              className="gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="neon"
              onClick={handleSubmit}
              disabled={!canProceed}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Submit Answers
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
