#!/bin/bash
cd ../uploads

text=$(pwd)
IFS='/'
read -a splitpwd <<< $text

if [ "${splitpwd[${#splitpwd[*]}-1]}" == "uploads" ]; then
  for file in *
  do
    echo $file
  done

  touch initializeFile.txt
  echo "Don't delete this file!" > initializeFile.txt
fi

cd ../zipFiles

text=$(pwd)
IFS='/'
read -a splitpwd <<< $text

if [ "${splitpwd[${#splitpwd[*]}-1]}" == "zipFiles" ]; then
  for file in *
  do
    echo $file
  done

  touch initializeFile.txt
  echo "Don't delete this file!" > initializeFile.txt
fi