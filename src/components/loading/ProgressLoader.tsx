"use client";

import React from "react";
import { CheckCircle, Upload, FileText, CreditCard } from "lucide-react";

/**
 * Progress Loader Components
 *
 * Use cases:
 * - File uploads, form submissions, multi-step processes
 * - When you can track progress percentage
 * - Operations with known duration
 */

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  color?: "red" | "blue" | "green" | "yellow";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  showPercentage = true,
  color = "red",
  size = "md",
  className = "",
}) => {
  const colorClasses = {
    red: "bg-red-600",
    blue: "bg-blue-600",
    green: "bg-green-600",
    yellow: "bg-yellow-600",
  };

  const sizeClasses = {
    sm: "h-2",
    md: "h-3",
    lg: "h-4",
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {showPercentage && <span className="text-sm text-gray-500">{Math.round(progress)}%</span>}
        </div>
      )}

      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Step Progress Indicator
 * For multi-step processes like checkout, onboarding
 */
interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
  className?: string;
}

export const StepProgress: React.FC<StepProgressProps> = ({ currentStep, totalSteps, steps, className = "" }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Progress Bar */}
      <ProgressBar progress={(currentStep / totalSteps) * 100} color="red" size="lg" />

      {/* Step Labels */}
      <div className="flex justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center space-y-1">
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${
                index < currentStep
                  ? "bg-red-600 text-white"
                  : index === currentStep
                  ? "bg-red-100 text-red-600 border-2 border-red-600"
                  : "bg-gray-200 text-gray-500"
              }
            `}
            >
              {index < currentStep ? <CheckCircle className="w-4 h-4" /> : index + 1}
            </div>
            <span
              className={`
              text-xs text-center max-w-20
              ${index <= currentStep ? "text-gray-900" : "text-gray-500"}
            `}
            >
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Upload Progress
 * For file uploads with detailed progress
 */
interface UploadProgressProps {
  progress: number;
  fileName: string;
  fileSize: string;
  speed?: string;
  timeRemaining?: string;
  onCancel?: () => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  fileName,
  fileSize,
  speed,
  timeRemaining,
  onCancel,
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-red-100 rounded-lg">
          <Upload className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
          <p className="text-xs text-gray-500">{fileSize}</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            ×
          </button>
        )}
      </div>

      <ProgressBar progress={progress} color="red" />

      {(speed || timeRemaining) && (
        <div className="flex justify-between text-xs text-gray-500">
          {speed && <span>{speed}</span>}
          {timeRemaining && <span>{timeRemaining} remaining</span>}
        </div>
      )}
    </div>
  );
};

/**
 * Payment Processing Progress
 * For payment flows
 */
interface PaymentProgressProps {
  step: "processing" | "verifying" | "completing";
  progress: number;
}

export const PaymentProgress: React.FC<PaymentProgressProps> = ({ step, progress }) => {
  const steps = ["Processing", "Verifying", "Completing"];
  const currentStepIndex = steps.indexOf(step.charAt(0).toUpperCase() + step.slice(1));

  const stepIcons = {
    processing: <CreditCard className="w-5 h-5" />,
    verifying: <FileText className="w-5 h-5" />,
    completing: <CheckCircle className="w-5 h-5" />,
  };

  return (
    <div className="text-center space-y-4">
      <div className="flex justify-center">
        <div className="p-4 bg-red-100 rounded-full">{stepIcons[step]}</div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">{step.charAt(0).toUpperCase() + step.slice(1)} Payment</h3>
        <p className="text-sm text-gray-600">Please don&apos;t close this window</p>
      </div>

      <ProgressBar progress={progress} color="red" size="lg" className="max-w-md mx-auto" />
    </div>
  );
};

