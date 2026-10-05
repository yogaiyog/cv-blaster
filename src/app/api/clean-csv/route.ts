import { NextResponse } from 'next/server';
import { cleanQuestionsInStorage } from '@/lib/storage';

export async function POST() {
  try {
    const result = await cleanQuestionsInStorage();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
